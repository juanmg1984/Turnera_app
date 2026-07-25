const db = require('node:sqlite');
const d = new db.DatabaseSync('turnera.db');
d.exec("UPDATE usuarios SET hash = '$2b$10$tZ2c/tXW6R7jU/jR3P1z4eE7I9T8QZ2y6/w6x2U5R4V2Q7K1c5T9u' WHERE email = 'demo@americanjet.demo'");
console.log('Updated');
