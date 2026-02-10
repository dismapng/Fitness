const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const config = require('./config');
const db = require('./database');

// Инициализация бота
const bot = new TelegramBot(config.TELEGRAM_TOKEN, { polling: true });
const app = express();
const PORT = process.env.PORT || 3000;

// Включить для Render
if (process.env.RENDER) {
  app.get('/', (req, res) => {
    res.send('Fitness Bot is running!');
  });
  
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

console.log('✅ Fitness Bot запущен!');

// ========== КОМАНДА /START ==========
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  
  // Сохраняем пользователя
  let dbUser = await db.getUser(user.id);
  if (!dbUser) {
    await db.createUser(user);
    dbUser = await db.getUser(user.id);
  }
  
  // Проверка на админа
  if (config.ADMIN_IDS.includes(user.id)) {
    bot.sendMessage(chatId, `👑 Привет, администратор ${user.first_name}!`, {
      reply_markup: {
        keyboard: [
          [{ text: "📊 Статистика" }, { text: "👥 Пользователи" }],
          [{ text: "📢 Рассылка" }, { text: "🔄 Сброс демо" }],
          [{ text: "🏠 Главное меню" }]
        ],
        resize_keyboard: true
      }
    });
    return;
  }
  
  // Приветствие для нового пользователя
  bot.sendMessage(chatId,
    `Привет, ${user.first_name}! 👋\n\n` +
    `Я — твой персональный фитнес-гид от *bosikom.fit*!\n\n` +
    `🎁 *Специально для тебя:*\n` +
    `5-дневный марафон *«Лёгкий старт»* — БЕСПЛАТНО!\n\n` +
    `Чтобы начать, напиши, как тебя зовут:`,
    { parse_mode: 'Markdown' }
  );
});

// ========== ОБРАБОТКА ТЕКСТОВЫХ СООБЩЕНИЙ ==========
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const user = msg.from;
  
  if (!text || text.startsWith('/')) return;
  
  // Получаем пользователя из БД
  const dbUser = await db.getUser(user.id);
  if (!dbUser) return;
  
  // Если пользователь ещё не представился
  if (!dbUser.user_name && text.length > 1) {
    // Сохраняем имя
    await new Promise((resolve) => {
      db.db.run('UPDATE users SET user_name = ? WHERE telegram_id = ?', [text, user.id], resolve);
    });
    
    // Начинаем марафон
    await db.updateMarathonDay(user.id, 1);
    
    // Отправляем первый день
    const dayContent = config.MARATHON_CONTENT[1];
    
    bot.sendMessage(chatId,
      `Прекрасно, ${text}! Рада знакомству! 💖\n\n` +
      `${dayContent.text}\n\n` +
      `Нажми кнопку ниже, когда выполнишь задание:`,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          keyboard: [
            [{ text: "✅ Выполнила задание" }],
            [{ text: "⏰ Напомнить позже" }, { text: "❓ Задать вопрос" }]
          ],
          resize_keyboard: true
        }
      }
    );
    return;
  }
  
  // Обработка кнопок
  switch(text) {
    case "✅ Выполнила задание":
      const day = dbUser.marathon_day;
      await db.completeDay(user.id, day);
      
      if (day === 5) {
        // Последний день - предлагаем курс
        bot.sendMessage(chatId,
          `🎉 *ПОЗДРАВЛЯЮ!* Ты завершила 5-дневный марафон! 🏆\n\n` +
          `Ты прошла важный путь и готова к большему!\n\n` +
          `🔥 *Представляю основной курс:*\n` +
          `«${config.COURSE_NAME}»\n\n` +
          `✅ 30 дней персональных тренировок\n` +
          `✅ Питание по твоему типу метаболизма\n` +
          `✅ Ежедневная поддержка куратора\n` +
          `✅ Закрытое сообщество единомышленниц\n` +
          `✅ Медитации и работа с mindset\n\n` +
          `💵 *Стоимость:* ${config.COURSE_PRICE} руб.\n` +
          `🎁 *При оплате сегодня:* ${config.DISCOUNT_PRICE} руб.\n\n` +
          `Готова изменить свою жизнь?`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [{ text: `💳 Купить за ${config.DISCOUNT_PRICE} руб.`, callback_data: 'buy_course' }],
                [{ text: "👀 Посмотреть отзывы", url: "https://t.me/bosikom_reviews" }]
              ]
            }
          }
        );
      } else {
        // Следующий день
        const nextDay = day + 1;
        await db.updateMarathonDay(user.id, nextDay);
        const nextDayContent = config.MARATHON_CONTENT[nextDay];
        
        bot.sendMessage(chatId,
          `Супер! Ты молодец! 🌟\n\n` +
          `${nextDayContent.text}\n\n` +
          `Нажми кнопку ниже, когда выполнишь:`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [
                [{ text: "✅ Выполнила задание" }],
                [{ text: "🏠 Главное меню" }]
              ],
              resize_keyboard: true
            }
          }
        );
      }
      break;
      
    case "⏰ Напомнить позже":
      bot.sendMessage(chatId,
        "Хорошо, напомню через 2 часа ⏰\n\n" +
        "Не забывай — регулярность важнее интенсивности! 💪",
        {
          reply_markup: {
            keyboard: [[{ text: "🎯 Текущий день" }]],
            resize_keyboard: true
          }
        }
      );
      break;
      
    case "🎯 Текущий день":
      if (dbUser.marathon_day > 0) {
        const currentDayContent = config.MARATHON_CONTENT[dbUser.marathon_day];
        bot.sendMessage(chatId,
          `🎯 *Твой текущий день: ${dbUser.marathon_day} из 5*\n\n` +
          `${currentDayContent.text}`,
          {
            parse_mode: 'Markdown',
            reply_markup: {
              keyboard: [[{ text: "✅ Выполнила задание" }]],
              resize_keyboard: true
            }
          }
        );
      }
      break;
      
    case "💳 Купить курс":
      bot.sendMessage(chatId,
        `🏆 *ПОЛНЫЙ КУРС «${config.COURSE_NAME}»*\n\n` +
        `Что входит:\n` +
        `• 30 дней видео-тренировок\n` +
        `• План питания (3 варианта)\n` +
        `• Ежедневные медитации\n` +
        `• Поддержка в закрытом чате\n` +
        `• Чек-листы и гайды\n` +
        `• Разбор ошибок\n\n` +
        `💵 *Обычная цена:* ${config.COURSE_PRICE} руб.\n` +
        `🔥 *Цена сегодня:* ${config.DISCOUNT_PRICE} руб.\n\n` +
        `Выбери вариант оплаты:`,
        {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: `💳 Оплатить ${config.DISCOUNT_PRICE} руб.`, callback_data: 'buy_course' }],
              [{ text: "👀 Демо-канал", url: config.PRIVATE_CHANNEL }]
            ]
          }
        }
      );
      break;
      
    case "📞 Контакты":
      const contacts = config.CONTACTS;
      bot.sendMessage(chatId,
        `📞 *Контакты студии bosikom.fit:*\n\n` +
        `📍 ${contacts.address}\n` +
        `📱 ${contacts.phone}\n` +
        `✉️ ${contacts.email}\n` +
        `🌐 ${contacts.site}\n\n` +
        `⏰ *Часы работы:*\n${contacts.schedule}`,
        { parse_mode: 'Markdown' }
      );
      break;
      
    case "🏠 Главное меню":
      bot.sendMessage(chatId, "Выбери действие:", {
        reply_markup: {
          keyboard: [
            [{ text: "🎯 Текущий день" }, { text: "📊 Мой прогресс" }],
            [{ text: "💳 Купить курс" }, { text: "📞 Контакты" }]
          ],
          resize_keyboard: true
        }
      });
      break;
      
    case "📊 Мой прогресс":
      const progress = await db.getProgress(user.id);
      const completed = progress.filter(p => p.completed === 1).length;
      
      let progressText = `📊 *Твой прогресс:*\n\n`;
      progressText += `Выполнено: ${completed} из ${progress.length} дней\n\n`;
      
      progress.forEach(p => {
        progressText += `День ${p.day}: ${p.completed ? '✅ Выполнен' : '⏳ В процессе'}\n`;
      });
      
      bot.sendMessage(chatId, progressText, { parse_mode: 'Markdown' });
      break;
  }
});

// ========== ОБРАБОТКА CALLBACK (ОПЛАТА) ==========
bot.on('callback_query', async (callbackQuery) => {
  const msg = callbackQuery.message;
  const user = callbackQuery.from;
  
  if (callbackQuery.data === 'buy_course') {
    // Демо-оплата
    await db.createPayment(user.id, config.DISCOUNT_PRICE);
    
    bot.sendMessage(msg.chat.id,
      `✅ *ДЕМО-РЕЖИМ: Платеж успешен!*\n\n` +
      `Сумма: ${config.DISCOUNT_PRICE} руб.\n` +
      `Курс: ${config.COURSE_NAME}\n\n` +
      `🎉 *Поздравляю с покупкой!*\n\n` +
      `Переходи в наш закрытый канал: ${config.PRIVATE_CHANNEL}\n\n` +
      `Все материалы уже ждут тебя там!`,
      { parse_mode: 'Markdown' }
    );
    
    bot.answerCallbackQuery(callbackQuery.id);
  }
});

// ========== АДМИН-ПАНЕЛЬ ==========
bot.onText(/\/admin/, async (msg) => {
  const user = msg.from;
  if (!config.ADMIN_IDS.includes(user.id)) return;
  
  const stats = await db.getStats();
  
  bot.sendMessage(msg.chat.id,
    `👑 *Панель администратора*\n\n` +
    `📊 Статистика:\n` +
    `• Всего пользователей: ${stats.total_users}\n` +
    `• Купили курс: ${stats.paid_users}\n` +
    `• Активных в марафоне: ${stats.active_users}\n` +
    `• Конверсия: ${((stats.paid_users / stats.total_users) * 100).toFixed(1)}%\n\n` +
    `Выбери действие:`,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: "📊 Статистика" }, { text: "👥 Пользователи" }],
          [{ text: "📢 Рассылка" }],
          [{ text: "🏠 Главное меню" }]
        ],
        resize_keyboard: true
      }
    }
  );
});

// Обработка админ-кнопок
bot.on('message', async (msg) => {
  const user = msg.from;
  if (!config.ADMIN_IDS.includes(user.id)) return;
  
  switch(msg.text) {
    case "📊 Статистика":
      const stats = await db.getStats();
      bot.sendMessage(msg.chat.id,
        `📊 *Статистика бота:*\n\n` +
        `👥 Всего пользователей: ${stats.total_users}\n` +
        `💳 Купили курс: ${stats.paid_users}\n` +
        `🏃‍♀️ Активных в марафоне: ${stats.active_users}\n` +
        `📈 Конверсия: ${((stats.paid_users / stats.total_users) * 100).toFixed(1)}%`,
        { parse_mode: 'Markdown' }
      );
      break;
      
    case "👥 Пользователи":
      const users = await db.getAllUsers();
      let usersText = `👥 *Последние ${users.length} пользователей:*\n\n`;
      
      users.forEach(u => {
        usersText += `• ${u.user_name || u.first_name} (${u.marathon_day} день) - ${u.has_paid ? '✅ Купил' : '🆓 Бесплатный'}\n`;
      });
      
      bot.sendMessage(msg.chat.id, usersText, { parse_mode: 'Markdown' });
      break;
  }
});

console.log('🚀 Бот готов к работе!');
