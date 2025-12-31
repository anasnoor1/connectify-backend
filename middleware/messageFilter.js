module.exports = function cleanMessage(message) {
  const patterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, // email
    /(\+?\d{1,3})?[\s.-]?\d{3}[\s.-]?\d{3,4}/g, // phone
    /@[\w\d_.]+/g, // social handles
    /(https?:\/\/[^\s]+)/g, // links
  ];

  for (const p of patterns) {
    if (p.test(message)) return null;
  }

  return message;
};
