const { Bot, InlineKeyboard } = require("grammy");
const prisma = require("./db");
const cron = require('node-cron');
require("dotenv").config();

const bot = new Bot(process.env.BOT_TOKEN);

bot.command("start", async (ctx) => {
  const userId = BigInt(ctx.from.id);
  const firstName = ctx.from.first_name;
  const username = ctx.from.username;

  // 1. Регистрация/обновление пользователя
  const user = await prisma.user.upsert({
    where: { id: userId },
    update: { username, firstName },
    create: { id: userId, username, firstName },
  });

  // 2. Проверяем, пришел ли пользователь по приглашению
  const payload = ctx.match; // Это то, что идет после /start (например, "1234567")

  if (payload) {
    const inviterId = BigInt(payload);

    try {
      // Пытаемся создать связь (Дракона)
      // Сортируем ID, чтобы всегда user1Id < user2Id (избегаем дублей)
      const [u1, u2] = userId < inviterId ? [userId, inviterId] : [inviterId, userId];

      const streak = await prisma.streak.upsert({
        where: {
          user1Id_user2Id: { user1Id: u1, user2Id: u2 }
        },
        update: {}, // Если связь уже есть, ничего не меняем
        create: {
          user1Id: u1,
          user2Id: u2,
          count: 1,
        }
      });

      await ctx.reply("🔥 Ура! Вы объединились с другом. Ваш общий огненный дракон родился!");
    } catch (e) {
      console.error("Ошибка создания связи:", e);
    }
  }

// 1. Создаем правильную ссылку-приглашение
const inviteLink = `https://t.me/${ctx.me.username}?start=${userId}`;

// 2. Ссылка на Mini App (фронтенд)
const webAppUrl = process.env.FRONTEND_URL || "https://google.com";

// 3. Клавиатура
const keyboard = new InlineKeyboard()
  .webApp("🐾 Мой питомец", webAppUrl)
  .row()
  .url(
    "➕ Пригласить друга", 
    `https://t.me/share/url?url=${inviteLink}&text=Давай заведем общего огненного дракона!`
  );

// 4. САМОЕ ВАЖНОЕ: В тексте сообщения должна быть ПЕРЕМЕННАЯ inviteLink
await ctx.reply(
  `Привет, ${firstName}! \n\n` +
  `Твоя персональная ссылка для приглашения друзей: \n${inviteLink}`, // Проверь эту строку!
  { reply_markup: keyboard }
);
});

bot.on("message", async (ctx) => {
  const userId = BigInt(ctx.from.id);
  const userName = ctx.from.first_name;

  try {
    const streaks = await prisma.streak.findMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }, { groupId: BigInt(ctx.chat.id) }] }
    });

    for (const streak of streaks) {
      const isUser1 = streak.user1Id === userId;
      
      // Инкрементируем счетчик сообщений
      const updateData = isUser1 
        ? { lastActivity1: new Date(), dailyMsgs1: { increment: 1 } }
        : { lastActivity2: new Date(), dailyMsgs2: { increment: 1 } };
      
      const updatedStreak = await prisma.streak.update({
        where: { id: streak.id },
        data: updateData
      });

      // Проверка достижения (100 сообщений)
      const msgCount = isUser1 ? updatedStreak.dailyMsgs1 : updatedStreak.dailyMsgs2;
      if (msgCount === 100) {
        await prisma.streak.update({
          where: { id: streak.id },
          data: { freezesAvailable: { increment: 1 } }
        });
        await ctx.reply(`🏆 Достижение! Вы написали 100 сообщений сегодня. Получена 🧊 Заморозка!`);
      }

      // Эхо-сообщение партнеру (оставляем твою логику)
      const partnerId = isUser1 ? streak.user2Id : streak.user1Id;
      const lastPartnerActivity = isUser1 ? new Date(streak.lastActivity2) : new Date(streak.lastActivity1);
      if ((new Date() - lastPartnerActivity) / (1000 * 60 * 60) > 3) {
        await bot.api.sendMessage(partnerId.toString(), `🔥 ${userName} греет дракона! Присоединяйся.`);
      }
    }
  } catch (e) { console.error(e); }
});

bot.command("bind", async (ctx) => {
  if (ctx.chat.type === "private") {
    return ctx.reply("Эту команду нужно вводить в ГРУППЕ, которую вы создали с другом.");
  }

  const userId = BigInt(ctx.from.id);
  const groupId = BigInt(ctx.chat.id);

  // Ищем стрик этого пользователя
  const streak = await prisma.streak.findFirst({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] }
  });

  if (!streak) {
    return ctx.reply("Сначала создай дракона в личке с ботом!");
  }

  // Привязываем ID группы к стрику
  await prisma.streak.update({
    where: { id: streak.id },
    data: { groupId: groupId }
  });

  await ctx.reply("✅ Группа привязана! Теперь ваше общение здесь будет питать дракона огнем.");
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
  console.error(err.error);
});

bot.start();

cron.schedule('0 * * * *', async () => {
  console.log("🔍 Проверка состояния драконов (Раз в час)...");

  try {
    const now = new Date();
    const streaks = await prisma.streak.findMany({
      include: { user1: true, user2: true }
    });

    for (const streak of streaks) {
      const diff1 = (now - new Date(streak.lastActivity1)) / (1000 * 60 * 60);
      const diff2 = (now - new Date(streak.lastActivity2)) / (1000 * 60 * 60);

      // Уведомление на 20-м часу тишины
      if (diff1 > 20 && diff1 < 21) {
        await bot.api.sendMessage(streak.user1Id.toString(), "🔥 Твой дракон мерзнет! Напиши что-нибудь в чат, чтобы согреть его!");
      }
      
      if (diff2 > 20 && diff2 < 21) {
        await bot.api.sendMessage(streak.user2Id.toString(), "🔥 Твой дракон мерзнет! Напиши что-нибудь в чат, чтобы согреть его!");
      }

      // Уведомление о "смерти" на 24-м часу
      if (diff1 >= 24 && diff2 >= 24 && diff1 < 25) {
        const msg = "🪨 К сожалению, ваш огонь погас, и дракон превратился в камень. Зайдите в приложение, чтобы пробудить его!";
        await bot.api.sendMessage(streak.user1Id.toString(), msg);
        await bot.api.sendMessage(streak.user2Id.toString(), msg);
      }
    }
  } catch (error) {
    console.error("Ошибка в планировщике:", error);
  }
});