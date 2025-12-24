const express = require("express");
const cors = require("cors");
const prisma = require("./db");
const crypto = require('crypto');
const app = express();
const path = require('path');

require('./bot');

app.use(cors());
app.use(express.json());

// Функция проверки (оставляем как есть)
function verifyTelegramData(initData, botToken) {
  if (!initData || initData === "undefined") {
    console.log("⚠️ Внимание: Проверка пропущена (тест в браузере)");
    return true; 
  }
  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  urlParams.delete('hash');

  const dataCheckString = Array.from(urlParams.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  return calculatedHash === hash;
}

// ПРИМЕР ЗАЩИЩЕННОГО РОУТА
app.get("/api/streaks/:userId", async (req, res) => {
  const initData = req.headers['x-tg-data']; // Фронтенд должен присылать это в заголовках

  // ВОТ ЗДЕСЬ МЫ ВЫЗЫВАЕМ ПРОВЕРКУ
  if (!verifyTelegramData(initData, process.env.BOT_TOKEN)) {
    return res.status(403).json({ error: "Access denied. Invalid Telegram data." });
  }

  const userId = BigInt(req.params.userId);
  const streaks = await prisma.streak.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    include: { user1: true, user2: true }
  });

  const processedStreaks = streaks.map(s => {
    const now = new Date();
    // Считаем разницу в часах для каждого друга
    const diff1 = (now - new Date(s.lastActivity1)) / (1000 * 60 * 60);
    const diff2 = (now - new Date(s.lastActivity2)) / (1000 * 60 * 60);

    let health = 0;
    if (diff1 <= 24 && diff2 <= 24) health = 100; // Оба активны
    else if (diff1 <= 24 || diff2 <= 24) health = 50;  // Только один

    return { ...s, health };
  });

const safeData = JSON.parse(JSON.stringify(streaks, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));

  // Теперь в safeData точно есть и petName, и freezesAvailable
  res.json(safeData);
});

// Действие "Поддержать огонь" (Check-in)
app.post("/api/checkin", async (req, res) => {
  const initData = req.headers['x-tg-data'];

  // Проверка безопасности
  if (!verifyTelegramData(initData, process.env.BOT_TOKEN)) {
    return res.status(403).json({ error: "Access denied" });
  }

  const { streakId } = req.body;

  try {
    const streak = await prisma.streak.update({
      where: { id: parseInt(streakId) },
      data: {
        lastCheckIn: new Date(),
        // При нажатии на кнопку мы можем, например, давать бонус к счетчику
        count: { increment: 1 } 
      }
    });

    res.json({ success: true, count: streak.count });
  } catch (error) {
    console.error("Ошибка при чек-ине:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/api/rename-pet", async (req, res) => {
  const { streakId, newName } = req.body;
  const initData = req.headers['x-tg-data'];

  if (!verifyTelegramData(initData, process.env.BOT_TOKEN)) {
    return res.status(403).json({ error: "Access denied" });
  }

  try {
    const updated = await prisma.streak.update({
      where: { id: parseInt(streakId) },
      data: { petName: newName }
    });
    res.json({ success: true, petName: updated.petName });
  } catch (e) {
    // ВОТ ЭТА СТРОКА ПОКАЖЕТ ОШИБКУ В ТЕРМИНАЛЕ
    console.error("❌ Ошибка Prisma при смене имени:", e); 
    res.status(500).json({ error: "Ошибка при смене имени" });
  }
});

// 2. Получение Лидерборда (Топ-10 пар)
app.get("/api/leaderboard", async (req, res) => {
  try {
    const topStreaks = await prisma.streak.findMany({
      take: 10,
      orderBy: { count: 'desc' },
      include: {
        user1: true,
        user2: true
      }
    });

    // Форматируем данные для фронтенда
    const result = topStreaks.map(s => ({
      id: s.id,
      petName: s.petName,
      count: s.count,
      players: `${s.user1.username || 'Игрок'} & ${s.user2.username || 'Игрок'}`
    }));

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "Ошибка загрузки лидерборда" });
  }
});

app.post("/api/use-freeze", async (req, res) => {
  const { streakId } = req.body;
  try {
    const streak = await prisma.streak.findUnique({ where: { id: parseInt(streakId) } });
    
    if (streak && streak.freezesAvailable > 0) {
      const updated = await prisma.streak.update({
        where: { id: streak.id },
        data: { 
          freezesAvailable: { decrement: 1 },
          lastActivity1: new Date(), // Искусственно "оживляем"
          lastActivity2: new Date() 
        }
      });
      res.json({ success: true, freezes: updated.freezesAvailable });
    } else {
      res.status(400).json({ error: "Нет доступных заморозок" });
    }
  } catch (e) { res.status(500).send(e.message); }
});

const clientPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientPath));

// Все остальные запросы отправляем на индексную страницу React
app.get('(.*)', (req, res) => {
  res.sendFile(path.join(clientPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер и Бот запущены на порту ${PORT}`));