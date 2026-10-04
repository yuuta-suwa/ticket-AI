const React = require('react');
// Minimal date input for the web screenshot export.
function DateTimePicker({ value, onChange }) {
  return React.createElement('input', { type: 'date', value: value.toISOString().slice(0, 10), onChange: (e) => onChange({}, new Date(e.target.value)) });
}
module.exports = { __esModule: true, default: DateTimePicker };
