const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Student = require('../models/Student');
const Session = require('../models/Session');
const School = require('../models/School');
const Announcement = require('../models/Announcement');
const ResultToken = require('../models/ResultToken');
const PDFDocument = require('pdfkit');
const bcrypt = require('bcrypt');
const { requireAuth, requireRole } = require('../middleware/auth');

// All student routes require authentication and student role
router.use(requireAuth);
router.use(requireRole('student'));

// Student Portal
router.get('/portal', async (req, res) => {
  try {
    const user = req.session.user;
    const student = await Student.findById(user.id);
    
    if (!student) {
      return res.redirect('/login?error=Student not found');
    }
    
    const activeSession = await Session.getActiveSession(req.session.campus);
    
    // Get current term results (approved/published results)
    const currentResults = await Result.find({
      studentID: student.studentID,
      session: student.currentSession,
      term: activeSession ? activeSession.currentTerm : 'First Term',
      status: 'published',
      campus: req.session.campus
    }).sort({ subject: 1 });
    
    // Calculate subject positions
    for (const result of currentResults) {
      const subjectResults = await Result.find({
        className: result.className,
        subject: result.subject,
        term: result.term,
        session: result.session,
        status: 'published',
        campus: req.session.campus
      }).sort({ total: -1 });
      
      result.subjectPosition = subjectResults.findIndex(r => r.studentID === result.studentID) + 1;
    }
    
    // Calculate class position
    const classResults = await Result.find({
      className: student.currentClass,
      session: student.currentSession,
      term: activeSession ? activeSession.currentTerm : 'First Term',
      status: 'published',
      campus: req.session.campus
    });
    
    const studentAverages = classResults.reduce((acc, result) => {
      if (!acc[result.studentID]) {
        acc[result.studentID] = { total: 0, count: 0 };
      }
      acc[result.studentID].total += result.total;
      acc[result.studentID].count += 1;
      return acc;
    }, {});
    
    const averages = Object.entries(studentAverages).map(([studentID, data]) => ({
      studentID,
      average: data.total / data.count
    })).sort((a, b) => b.average - a.average);
    
    const classPosition = averages.findIndex(s => s.studentID === student.studentID) + 1;
    
    // Calculate statistics
    const totalSubjects = currentResults.length;
    const totalMarks = currentResults.reduce((sum, result) => sum + result.total, 0);
    const averageScore = totalSubjects > 0 ? (totalMarks / totalSubjects).toFixed(2) : 0;
    
    // Grade distribution
    const gradeDistribution = currentResults.reduce((acc, result) => {
      acc[result.grade] = (acc[result.grade] || 0) + 1;
      return acc;
    }, {});
    
    // Get announcements for students
    const announcements = await Announcement.find({
      isActive: true,
      targetAudience: { $in: ['all', 'students'] },
      campus: req.session.campus
    }).sort({ createdAt: -1 }).limit(5);
    
    // Get login announcements from session
    const loginAnnouncements = req.session.announcements || [];
    delete req.session.announcements; // Clear after showing
    
    res.render('pages/student/portal', {
      title: 'Student Portal',
      student,
      currentResults,
      activeSession,
      announcements,
      loginAnnouncements,
      stats: {
        totalSubjects,
        totalMarks,
        averageScore,
        gradeDistribution,
        classPosition
      }
    });
  } catch (error) {
    console.error('Error loading student portal:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load portal', error });
  }
});

// View All Results - UPDATED for new status system
router.get('/results', async (req, res) => {
  try {
    const user = req.session.user;
    const student = await Student.findById(user.id);
    
    if (!student) {
      return res.redirect('/login?error=Student not found');
    }
    
    const selectedTerm = req.query.term;
    const selectedSession = req.query.session || student.currentSession;
    
    // Get filter options (only from approved/published results)
    const availableTerms = await Result.distinct('term', { 
      studentID: student.studentID, 
      status: 'published',
      campus: req.session.campus
    });
    const availableSessions = await Result.distinct('session', { 
      studentID: student.studentID, 
      status: 'published',
      campus: req.session.campus
    });
    
    // Build filter
    const filter = {
      studentID: student.studentID,
      status: 'published',
      campus: req.session.campus
    };
    
    if (selectedTerm) filter.term = selectedTerm;
    if (selectedSession) filter.session = selectedSession;
    
    const results = await Result.find(filter).sort({ subject: 1 });
    
    // Calculate subject positions
    for (const result of results) {
      const subjectResults = await Result.find({
        className: result.className,
        subject: result.subject,
        term: result.term,
        session: result.session,
        status: 'published',
        campus: req.session.campus
      }).sort({ total: -1 });
      
      result.subjectPosition = subjectResults.findIndex(r => r.studentID === result.studentID) + 1;
    }
    
    // Group results by term and session
    const groupedResults = results.reduce((acc, result) => {
      const key = `${result.session}-${result.term}`;
      if (!acc[key]) {
        acc[key] = {
          session: result.session,
          term: result.term,
          results: []
        };
      }
      acc[key].results.push(result);
      return acc;
    }, {});
    
    // Calculate class positions for each group
    for (const group of Object.values(groupedResults)) {
      const classResults = await Result.find({
        className: group.results[0].className,
        term: group.term,
        session: group.session,
        status: { $in: ['sent', 'approved', 'published'] },
        campus: req.session.campus
      });
      
      const studentAverages = classResults.reduce((acc, result) => {
        if (!acc[result.studentID]) {
          acc[result.studentID] = { total: 0, count: 0 };
        }
        acc[result.studentID].total += result.total;
        acc[result.studentID].count += 1;
        return acc;
      }, {});
      
      const averages = Object.entries(studentAverages).map(([studentID, data]) => ({
        studentID,
        average: data.total / data.count
      })).sort((a, b) => b.average - a.average);
      
      group.classPosition = averages.findIndex(s => s.studentID === student.studentID) + 1;
    }
    
    res.render('pages/student/results', {
      title: 'My Results',
      student,
      groupedResults,
      availableTerms,
      availableSessions,
      selectedTerm,
      selectedSession
    });
  } catch (error) {
    console.error('Error loading student results:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load results', error });
  }
});

// Download Result PDF - UPDATED for new grading system
router.get('/results/download', async (req, res) => {
  try {
    const user = req.session.user;
    const student = await Student.findById(user.id);
    const { term, session, token } = req.query;
    
    if (!student) {
      return res.status(404).send('Student not found');
    }
    
    // TOKEN GATE: validate result token before allowing download
    if (!token || !token.trim()) {
      return res.status(403).send('Result Token is required. Please contact your school administration.');
    }
    const activeSession = await Session.getActiveSession(req.session.campus);
    const tokenDoc = await ResultToken.findOne({
      studentID: student.studentID,
      campus: req.session.campus,
      isActive: true
    });
    if (!tokenDoc) {
      return res.status(403).send('No valid Result Token found. Please contact your school administration.');
    }
    if (tokenDoc.token !== token.trim()) {
      return res.status(403).send('Invalid Result Token. Please contact your school administration.');
    }
    if (tokenDoc.expiresAt && tokenDoc.expiresAt < new Date()) {
      return res.status(403).send('Result Token has expired. Please contact your school administration.');
    }
    
    // Get results for the specified term and session (approved/published results)
    const results = await Result.find({
      studentID: student.studentID,
      term: term || 'First Term',
      session: session || student.currentSession,
      status: 'published',
      campus: req.session.campus
    }).sort({ subject: 1 });
    
    if (results.length === 0) {
      return res.status(404).send('No approved results found for the specified term and session');
    }
    
    // Get school information
    const school = await School.findOne({ campus: req.session.campus });
    
    // Generate PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="result-${student.studentID}-${term}-${session}.pdf"`);
    
    // Pipe the PDF to the response
    doc.pipe(res);
    
    // Add school logo if available
    if (school && school.logo) {
      try {
        doc.image(`public${school.logo}`, 250, 50, { width: 100 });
        doc.moveDown(2);
      } catch (err) {
        console.log('Logo not found, skipping');
      }
    }
    
    // Add school header
    doc.fontSize(20).text(school ? school.name : 'School Name', { align: 'center' });
    doc.fontSize(12).text(school ? school.address : 'School Address', { align: 'center' });
    doc.fontSize(16).text('STUDENT RESULT REPORT', { align: 'center' });
    doc.moveDown();
    
    // Student information
    doc.fontSize(12);
    doc.text(`Student Name: ${student.fullName}`, 50, doc.y);
    doc.text(`Student ID: ${student.studentID}`, 300, doc.y);
    doc.text(`Class: ${student.currentClass}`, 50, doc.y);
    doc.text(`Session: ${session || student.currentSession}`, 300, doc.y);
    doc.text(`Term: ${term || 'First Term'}`, 50, doc.y);
    
    // Get student's position if available
    const firstResult = results[0];
    let classPosition = null;
    if (firstResult) {
      const classResults = await Result.find({
        className: firstResult.className,
        term: term || 'First Term',
        session: session || student.currentSession,
        status: { $in: ['sent', 'approved', 'published'] },
        campus: req.session.campus
      });
      
      const studentAverages = classResults.reduce((acc, result) => {
        if (!acc[result.studentID]) {
          acc[result.studentID] = { total: 0, count: 0 };
        }
        acc[result.studentID].total += result.total;
        acc[result.studentID].count += 1;
        return acc;
      }, {});
      
      const averages = Object.entries(studentAverages).map(([studentID, data]) => ({
        studentID,
        average: data.total / data.count
      })).sort((a, b) => b.average - a.average);
      
      classPosition = averages.findIndex(s => s.studentID === student.studentID) + 1;
    }
    
    if (classPosition) {
      doc.text(`Position: ${classPosition}`, 300, doc.y);
    }
    doc.moveDown();
    
    // Results table
    doc.text('RESULTS', { align: 'center', underline: true });
    doc.moveDown();
    
    // Table headers - dynamic based on class level
    const { getClassLevel } = require('../utils/classLevel');
    const isPrimary = getClassLevel(student.currentClass) === 'primary';
    const startY = doc.y;
    if (isPrimary) {
      doc.text('Subject', 50, startY);
      doc.text('CA (40)', 180, startY);
      doc.text('Exam (60)', 260, startY);
      doc.text('Total (100)', 340, startY);
      doc.text('Grade', 430, startY);
      doc.text('Remark', 480, startY);
    } else {
      doc.text('Subject', 50, startY);
      doc.text('1st CA (20)', 150, startY);
      doc.text('2nd CA (20)', 230, startY);
      doc.text('Exam (60)', 320, startY);
      doc.text('Total (100)', 400, startY);
      doc.text('Grade', 480, startY);
      doc.text('Remark', 530, startY);
    }
    
    // Draw line under headers
    doc.moveTo(50, startY + 15).lineTo(550, startY + 15).stroke();
    
    let currentY = startY + 25;
    let totalMarks = 0;
    
    // Calculate subject positions if not already
    for (const result of results) {
      if (!result.subjectPosition) {
        const subjectResults = await Result.find({
          className: result.className,
          subject: result.subject,
          term: result.term,
          session: result.session,
          status: { $in: ['sent', 'approved', 'published'] },
          campus: req.session.campus
        }).sort({ total: -1 });
        
        result.subjectPosition = subjectResults.findIndex(r => r.studentID === result.studentID) + 1;
      }
    }
    
    // Add results
    results.forEach((result) => {
      doc.text(result.subject, 50, currentY);
      if (isPrimary) {
        doc.text(result.ca1.toString(), 180, currentY);
        doc.text(result.exam.toString(), 260, currentY);
        doc.text(result.total.toString(), 340, currentY);
        doc.text(result.grade, 430, currentY);
        doc.text(result.remark, 480, currentY);
      } else {
        doc.text(result.ca1.toString(), 150, currentY);
        doc.text(result.ca2.toString(), 230, currentY);
        doc.text(result.exam.toString(), 320, currentY);
        doc.text(result.total.toString(), 400, currentY);
        doc.text(result.grade, 480, currentY);
        doc.text(result.remark, 530, currentY);
      }
      
      totalMarks += result.total;
      currentY += 20;
    });
    
    // Summary
    doc.moveDown();
    const averageScore = (totalMarks / results.length).toFixed(2);
    doc.text(`Total Subjects: ${results.length}`, 50, currentY + 20);
    doc.text(`Total Marks: ${totalMarks}`, 50, currentY + 40);
    doc.text(`Average Score: ${averageScore}%`, 50, currentY + 60);
    
    if (classPosition) {
      doc.text(`Class Position: ${classPosition}`, 50, currentY + 80);
    }
    
    // Footer
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 50, doc.page.height - 100);
    doc.text('This is a computer-generated document.', { align: 'center' }, doc.page.height - 80);
    
    // Finalize the PDF
    doc.end();
    
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).send('Error generating PDF');
  }
});

// Student Profile
router.get('/profile', async (req, res) => {
  try {
    const user = req.session.user;
    const student = await Student.findById(user.id);
    
    if (!student) {
      return res.redirect('/login?error=Student not found');
    }
    
    res.render('pages/student/profile', {
      title: 'My Profile',
      student
    });
  } catch (error) {
    console.error('Error loading student profile:', error);
    res.render('pages/error', { title: 'Error', message: 'Unable to load profile', error });
  }
});

// Update Password
router.post('/profile/password', async (req, res) => {
  try {
    const user = req.session.user;
    const { currentPassword, newPassword, confirmPassword } = req.body;
    
    const student = await Student.findById(user.id);
    if (!student) {
      return res.redirect('/student/profile?error=Student not found');
    }
    
    // Verify current password
    const isValidPassword = await student.comparePassword(currentPassword);
    if (!isValidPassword) {
      return res.redirect('/student/profile?error=Current password is incorrect');
    }
    
    // Check if new passwords match
    if (newPassword !== confirmPassword) {
      return res.redirect('/student/profile?error=New passwords do not match');
    }
    
    // Update password
    student.password = newPassword;
    await student.save();
    
    res.redirect('/student/profile?success=Password updated successfully');
  } catch (error) {
    console.error('Error updating password:', error);
    res.redirect('/student/profile?error=Failed to update password');
  }
});

module.exports = router;