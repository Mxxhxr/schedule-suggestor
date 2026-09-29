import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import Cookies from 'js-cookie';
import './Generate.css';

const convertTimePrefs = (days) => {
  const prefs = {};
  days.forEach(day => {
    if (day.checked) {
      prefs[day.name] = {
        start: day.startTime,
        end: day.endTime
      };
    }
  });
  return prefs;
};

// Grid measurements. Everything is expressed as a fraction of the grid's total
// time range (7 AM -> 10 PM), never in pixels. That way the schedule always
// fits its container, and the hour lines, time labels, and course blocks stay
// aligned with each other at any window size.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_SLOTS = ['7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];
const BASE_START_MINUTES = 7 * 60; // 7:00 AM
const TOTAL_MINUTES = TIME_SLOTS.length * 60;

// Soft, "white mixed in" palette — one color per course, assigned
// deterministically so the same course always gets the same color.
const COURSE_COLORS = [
  { bg: '#AEDBFF', text: '#1a3a5c' }, // soft blue
  { bg: '#FFDAB3', text: '#7a4400' }, // soft peach
  { bg: '#C9F2C7', text: '#1f5c1f' }, // soft green
  { bg: '#F3C6F3', text: '#5c1f5c' }, // soft pink
  { bg: '#FFF3B0', text: '#5c4b00' }, // soft yellow
  { bg: '#D3C6FF', text: '#33206e' }, // soft lavender
  { bg: '#FFC9C9', text: '#6e1f1f' }, // soft red
  { bg: '#C6F0F0', text: '#1f5c5c' }, // soft teal
];

const getCourseColor = (courseCode) => {
  let hash = 0;
  for (let i = 0; i < courseCode.length; i++) {
    hash = (hash * 31 + courseCode.charCodeAt(i)) >>> 0;
  }
  return COURSE_COLORS[hash % COURSE_COLORS.length];
};


const TimeTable = () => {
  const [schedules, setSchedules] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  // 'loading' | 'no-input' | 'empty' | 'error' | 'success'
  const [status, setStatus] = useState('loading');
  // Empty slot in the sidebar (under the Generate button) where the
  // "1 of N" control is rendered.
  const [navSlot, setNavSlot] = useState(null);

  // The schedule currently being displayed, derived from the list + index
  const selectedSchedule = schedules[currentIndex] || null;

  useEffect(() => {
    setNavSlot(document.getElementById('schedule-nav-slot'));
  }, []);

  useEffect(() => {
    const savedCourses = Cookies.get('Courses');
    const savedDays = Cookies.get('userDays');

    if (!savedCourses || !savedDays) {
      console.warn("No saved data in cookies.");
      setStatus('no-input');
      return;
    }

    const parsedCourses = JSON.parse(savedCourses).map(c => c.Course);
    const parsedDays = JSON.parse(savedDays);
    const formattedPrefs = convertTimePrefs(parsedDays);

    axios.post('http://localhost:5000/generate', {
      selectedCourses: parsedCourses,
      timePreferences: formattedPrefs
    })
    .then(res => {
      const results = res.data.schedules;
      setSchedules(results);
      setCurrentIndex(0);
      setStatus(results.length > 0 ? 'success' : 'empty');
    })
    .catch(err => {
      console.error('Error fetching schedule:', err);
      setStatus('error');
    });
  }, []);


  const toMinutes = (timeStr) => {
    const [time, modifier] = timeStr.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (modifier === "PM" && hours !== 12) hours += 12;
    if (modifier === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const dayMap = DAYS.reduce((acc, day, i) => {
    acc[day] = i;
    return acc;
  }, {});

  const renderCourseBlocks = () => {
    if (!selectedSchedule) return null;

    const blocks = [];

    Object.entries(selectedSchedule).forEach(([course, section]) => {
      const meetings = section.meetings || [];

      meetings.forEach((m, meetingIndex) => {
        const startMin = toMinutes(m.start);
        const endMin = toMinutes(m.end);
        const topPct = ((startMin - BASE_START_MINUTES) / TOTAL_MINUTES) * 100;
        const heightPct = ((endMin - startMin) / TOTAL_MINUTES) * 100;
        const dayIndex = dayMap[m.day];

        if (dayIndex === undefined) return;

        const color = getCourseColor(course);

        blocks.push(
          <div
            key={`${course}-${section.section}-${meetingIndex}`}
            className="course-block"
            style={{
              position: 'absolute',
              top: `${topPct}%`,
              left: `${(dayIndex / DAYS.length) * 100}%`,
              width: `${(1 / DAYS.length) * 100}%`,
              height: `${heightPct}%`,
              backgroundColor: color.bg,
              color: color.text,
              padding: '3px 4px',
              borderRadius: '4px',
              boxSizing: 'border-box',
              fontSize: '12px'
            }}
          >
            <div className="course-block-label">
              {course} - {section.section}
              <br />
              {m.start}–{m.end}
              {section.instructor && (
                <>
                  <br />
                  {section.instructor}
                </>
              )}
            </div>

            <div className="course-tooltip">
              <div className="course-tooltip-title">{section.title || course}</div>
              <div>{course} &middot; Section {section.section}</div>
              <div>{section.mode} &middot; {section.credits} credits</div>
              {section.instructor && <div>{section.instructor}</div>}
              <div className="course-tooltip-meetings">
                {m.day} {m.start}–{m.end}
              </div>
            </div>
          </div>
        );
      });
    });

    return blocks;
  };

  const renderStatusMessage = () => {
    const messages = {
      'no-input': {
        title: 'No courses or time preferences selected',
        body: 'Head to the Courses and Time Preference pages to make your selections first.'
      },
      'empty': {
        title: 'No possible schedule found',
        body: 'None of your selected courses fit together within your chosen time preferences. Try widening your available days/times or removing a conflicting course.'
      },
      'error': {
        title: 'Something went wrong',
        body: 'We couldn\'t reach the server to generate a schedule. Please try again in a moment.'
      }
    };

    const msg = messages[status];
    if (!msg) return null;

    return (
      <div className="schedule-status-message">
        <div className="schedule-status-title">{msg.title}</div>
        <div className="schedule-status-body">{msg.body}</div>
      </div>
    );
  };

  if (status === 'loading') {
    return (
      <div className="schedule-container">
        <div className="schedule-status-message">
          <div className="schedule-status-title">Generating your schedule…</div>
        </div>
      </div>
    );
  }

  if (status !== 'success') {
    return (
      <div className="schedule-container">
        {renderStatusMessage()}
      </div>
    );
  }

  return (
    <div className="schedule-container">
      <div className="schedule-grid">
        <div className="grid-header-row">
          <div className="grid-corner" />
          {DAYS.map(day => (
            <div key={day} className="grid-day-header">{day}</div>
          ))}
        </div>

        <div className="grid-body">
          <div className="grid-time-labels">
            {TIME_SLOTS.map((time, i) => (
              <div
                key={time}
                className="grid-time-label"
                style={{ top: `${(i / TIME_SLOTS.length) * 100}%` }}
              >
                {time}
              </div>
            ))}
          </div>

          <div className="grid-days">
            {DAYS.map(day => (
              <div key={day} className="grid-day-column">
                {TIME_SLOTS.map((_, i) => (
                  <React.Fragment key={i}>
                    <div
                      className="grid-hour-line"
                      style={{
                        top: `${(i / TIME_SLOTS.length) * 100}%`,
                        height: `${100 / TIME_SLOTS.length}%`
                      }}
                    />
                    <div
                      className="grid-half-hour-line"
                      style={{ top: `${((i + 0.5) / TIME_SLOTS.length) * 100}%` }}
                    />
                  </React.Fragment>
                ))}
              </div>
            ))}

            {/* Course blocks share this exact coordinate space, so their
                top/height math lines up with the background lines above. */}
            {renderCourseBlocks()}
          </div>
        </div>
      </div>

      {/* Rendered into the sidebar slot, under the Generate button */}
      {navSlot && createPortal(
        <div className="schedule-nav">
          <button
            className="schedule-nav-button"
            onClick={() => setCurrentIndex(i => i - 1)}
            disabled={currentIndex === 0}
            aria-label="Previous schedule"
          >
            &#8592;
          </button>
          <span className="schedule-nav-count">
            {currentIndex + 1} of {schedules.length}
          </span>
          <button
            className="schedule-nav-button"
            onClick={() => setCurrentIndex(i => i + 1)}
            disabled={currentIndex === schedules.length - 1}
            aria-label="Next schedule"
          >
            &#8594;
          </button>
        </div>,
        navSlot
      )}
    </div>
  );
};

export default TimeTable;