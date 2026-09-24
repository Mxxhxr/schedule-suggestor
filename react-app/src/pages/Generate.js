import React, { useEffect, useState } from 'react';
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

// Single source of truth for the grid's measurements. Both the background
// lines and the course blocks are positioned using these same numbers, so
// nothing can drift out of alignment the way it did with the old vw/vh table.
const HOUR_HEIGHT = 60; // px per hour row
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_SLOTS = ['7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM'];
const BASE_START_MINUTES = 7 * 60; // 7:00 AM

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
  const [selectedSchedule, setSelectedSchedule] = useState(null);

  useEffect(() => {
    const savedCourses = Cookies.get('Courses');
    const savedDays = Cookies.get('userDays');

    if (!savedCourses || !savedDays) {
      console.warn("No saved data in cookies.");
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
      setSelectedSchedule(results[0]);
    })
    .catch(err => {
      console.error('Error fetching schedule:', err);
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
        const topOffset = ((startMin - BASE_START_MINUTES) / 60) * HOUR_HEIGHT;
        const height = ((endMin - startMin) / 60) * HOUR_HEIGHT;
        const dayIndex = dayMap[m.day];

        if (dayIndex === undefined) return;

        const color = getCourseColor(course);

        blocks.push(
          <div
            key={`${course}-${section.section}-${meetingIndex}`}
            className="course-block"
            style={{
              position: 'absolute',
              top: `${topOffset}px`,
              left: `${(dayIndex / DAYS.length) * 100}%`,
              width: `${(1 / DAYS.length) * 100}%`,
              height: `${height}px`,
              backgroundColor: color.bg,
              color: color.text,
              padding: '4px',
              borderRadius: '4px',
              boxSizing: 'border-box',
              fontSize: '12px'
            }}
          >
            {course} - {section.section}
            <br />
            {m.start}–{m.end}

            <div className="course-tooltip">
              <div className="course-tooltip-title">{section.title || course}</div>
              <div>{course} &middot; Section {section.section}</div>
              <div>{section.mode} &middot; {section.credits} credits</div>
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
          <div className="grid-time-labels" style={{ height: `${TIME_SLOTS.length * HOUR_HEIGHT}px` }}>
            {TIME_SLOTS.map((time, i) => (
              <div
                key={time}
                className="grid-time-label"
                style={{ top: `${i * HOUR_HEIGHT}px` }}
              >
                {time}
              </div>
            ))}
          </div>

          <div className="grid-days" style={{ height: `${TIME_SLOTS.length * HOUR_HEIGHT}px` }}>
            {DAYS.map(day => (
              <div key={day} className="grid-day-column">
                {TIME_SLOTS.map((_, i) => (
                  <div
                    key={i}
                    className="grid-hour-line"
                    style={{ top: `${i * HOUR_HEIGHT}px`, height: `${HOUR_HEIGHT}px` }}
                  />
                ))}
              </div>
            ))}

            {/* Course blocks share this exact coordinate space, so their
                top/left math lines up with the background lines above. */}
            {renderCourseBlocks()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TimeTable;