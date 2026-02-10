const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./config');

class Database {
  constructor() {
    this.db = new sqlite3.Database(path.join(__dirname, 'database.db'));
    this.init();
  }
  
  init() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER UNIQUE,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        user_name TEXT,
        marathon_day INTEGER DEFAULT 0,
        marathon_started DATETIME,
        has_paid INTEGER DEFAULT 0,
        payment_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER,
        amount INTEGER,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    this.db.run(`
      CREATE TABLE IF NOT EXISTS progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        telegram_id INTEGER,
        day INTEGER,
        completed INTEGER DEFAULT 0,
        completed_at DATETIME,
        UNIQUE(telegram_id, day)
      )
    `);
  }
  
  // Пользователи
  async getUser(telegramId) {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT * FROM users WHERE telegram_id = ?', [telegramId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
  
  async createUser(userData) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO users (telegram_id, username, first_name, last_name, created_at) 
         VALUES (?, ?, ?, ?, datetime('now'))`,
        [userData.id, userData.username, userData.first_name, userData.last_name],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }
  
  async updateMarathonDay(telegramId, day) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `UPDATE users SET marathon_day = ?, marathon_started = datetime('now') 
         WHERE telegram_id = ?`,
        [day, telegramId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
  
  async completeDay(telegramId, day) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO progress (telegram_id, day, completed, completed_at) 
         VALUES (?, ?, 1, datetime('now'))`,
        [telegramId, day],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
  
  async getProgress(telegramId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT day, completed FROM progress WHERE telegram_id = ? ORDER BY day',
        [telegramId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }
  
  // Платежи
  async createPayment(telegramId, amount) {
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT INTO payments (telegram_id, amount, status) VALUES (?, ?, 'success')`,
        [telegramId, amount],
        function(err) {
          if (err) reject(err);
          else {
            this.db.run(
              'UPDATE users SET has_paid = 1, payment_date = datetime("now") WHERE telegram_id = ?',
              [telegramId]
            );
            resolve(this.lastID);
          }
        }
      );
    });
  }
  
  // Админ-статистика
  async getStats() {
    return new Promise((resolve, reject) => {
      this.db.all(`
        SELECT 
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM users WHERE has_paid = 1) as paid_users,
          (SELECT COUNT(*) FROM users WHERE marathon_day > 0) as active_users
      `, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });
  }
  
  async getAllUsers() {
    return new Promise((resolve, reject) => {
      this.db.all('SELECT * FROM users ORDER BY created_at DESC LIMIT 20', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
  
  close() {
    this.db.close();
  }
}

module.exports = new Database();
