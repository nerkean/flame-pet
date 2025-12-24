import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

const tg = window.Telegram.WebApp;

function App() {
  const [user, setUser] = useState(null)
  const [streak, setStreak] = useState(null)
  const [leaders, setLeaders] = useState([])
  const [loading, setLoading] = useState(true)
  
  // Состояния для управления интерфейсом
  const [view, setView] = useState('pet') // 'pet' или 'leaderboard'
  const [isEditingName, setIsEditingName] = useState(false)
  const [newName, setNewName] = useState('');

  const API_URL = '/api';

  useEffect(() => {
    tg.ready();
    tg.expand();
    const tgUser = tg.initDataUnsafe?.user;
    
    if (tgUser) {
      setUser(tgUser);
      fetchStreak(tgUser.id);
    } else {
      const fakeId = 799230342; 
      fetchStreak(fakeId);
    }
  }, [])

const fetchStreak = async (userId) => {
  setLoading(true); // Принудительно включаем в начале
  try {
    console.log("Отправляю запрос для ID:", userId);
    const response = await axios.get(`${API_URL}/streaks/${userId}`, {
      headers: { 'x-tg-data': tg.initData || "undefined" }
    });
    
    console.log("Сервер ответил:", response.data);
    
    if (response.data && response.data.length > 0) {
      setStreak(response.data[0]);
    }
  } catch (error) {
    console.error("Ошибка при получении данных:", error.message);
    // Можно вывести уведомление на экран
  } finally {
    console.log("Загрузка завершена");
    setLoading(false); // ВЫПОЛНИТСЯ В ЛЮБОМ СЛУЧАЕ
  }
}

const handleUseFreeze = async () => {
  try {
    const res = await axios.post(`${API_URL}/use-freeze`, { streakId: streak.id });
    setStreak({ ...streak, health: 100, freezesAvailable: res.data.freezes });
    tg.HapticFeedback.notificationOccurred('success');
  } catch (e) { alert("Ошибка использования"); }
};

  const fetchLeaderboard = async () => {
    try {
      const res = await axios.get(`${API_URL}/leaderboard`);
      setLeaders(res.data);
      setView('leaderboard');
    } catch (e) {
      alert("Не удалось загрузить топ");
    }
  }

  const handleRename = async () => {
    try {
      const res = await axios.post(`${API_URL}/rename-pet`, 
        { streakId: streak.id, newName },
        { headers: { 'x-tg-data': tg.initData } }
      );
      setStreak({ ...streak, petName: res.data.petName });
      setIsEditingName(false);
    } catch (e) {
      alert("Ошибка при переименовании");
    }
  }

  const handleCheckIn = async () => {
    if (!streak) return;
    try {
      const res = await axios.post(`${API_URL}/checkin`, 
        { streakId: streak.id },
        { headers: { 'x-tg-data': tg.initData } }
      );
      if (res.data.success) {
        setStreak({ ...streak, count: res.data.count });
        tg.HapticFeedback.impactOccurred('medium'); 
      }
    } catch (error) {
      alert("Ошибка при сохранении прогресса");
    }
  }

  // --- Вспомогательные функции ---
  const getDragonStage = (count) => {
    if (count < 3) return { emoji: '🥚', label: 'Загадочное яйцо' };
    if (count < 7) return { emoji: '🦎', label: 'Малыш-ящер' };
    if (count < 15) return { emoji: '🐲', label: 'Юный дракон' };
    return { emoji: '🔥', label: 'Огненный Властелин' };
  };

  const getProgress = () => {
    if (!streak) return 0;
    const count = streak.count;
    const nextLevel = count < 3 ? 3 : count < 7 ? 7 : count < 15 ? 15 : 30;
    return Math.min((count / nextLevel) * 100, 100);
  };

  if (loading) return <div className="loader">Загрузка...</div>

  return (
    <div className="container">
      <header>
        <h1>Flame Pet 🔥</h1>
        <div className="nav-tabs">
          <button className={view === 'pet' ? 'active' : ''} onClick={() => setView('pet')}>Дракон</button>
          <button className={view === 'leaderboard' ? 'active' : ''} onClick={fetchLeaderboard}>Топ</button>
        </div>
      </header>

      {view === 'pet' ? (
        <main className="game-card">
          {streak ? (
            <>
              {/* Смена имени */}
              <div className="name-section">
                {isEditingName ? (
                  <div className="rename-box">
                    <input 
  value={newName || ''}
  onChange={(e) => setNewName(e.target.value)} 
/>
                    <button onClick={handleRename}>✅</button>
                  </div>
                ) : (
                  <h2 onClick={() => setIsEditingName(true)} className="pet-name">
                    {streak.petName} <span>✏️</span>
                  </h2>
                )}
              </div>

              <div className="dragon-visual" style={{ 
                opacity: streak.health / 100 + 0.3,
                filter: streak.health === 0 ? 'grayscale(1)' : 'none' 
              }}>
                <div className="dragon-emoji">{streak.health === 0 ? '🪨' : getDragonStage(streak.count).emoji}</div>
                <div className="streak-badge">{streak.count} уровень</div>
              </div>

              <div className="stat-label">Здоровье огня: {streak.health}%</div>
              <div className="health-bar-container">
                <div className="health-bar" style={{ width: `${streak.health}%`, backgroundColor: streak.health > 50 ? '#ff4d00' : '#777' }}></div>
              </div>

              <div className="stat-label">Опыт эволюции:</div>
              <div className="progress-container">
                <div className="progress-bar" style={{ width: `${getProgress()}%` }}></div>
              </div>

              <button className="main-button" onClick={handleCheckIn}>
                {streak.health === 0 ? "✨ Пробудить магию" : "🔥 Поддержать огонь"}
              </button>

              {streak.freezesAvailable > 0 && (
  <div className="inventory-section">
    <div className="freeze-card" onClick={handleUseFreeze}>
      <span className="icon">🧊</span>
      <div className="info">
        <p>Заморозка ({streak.freezesAvailable})</p>
        <span>Восстановить огонь на 100%</span>
      </div>
    </div>
  </div>
)}

<div className="achievements-mini">
  <div className={`badge ${streak.dailyMsgs1 >= 100 ? 'unlocked' : ''}`}>💬 100</div>
  <div className={`badge ${streak.count >= 15 ? 'unlocked' : ''}`}>👑 King</div>
</div>
            </>
          ) : (
            <p>У тебя еще нет дракона. Пригласи друга!</p>
          )}
        </main>
      ) : (
        <div className="leaderboard">
          <h3>🏆 Топ Хранителей Огня</h3>
          {leaders.map((item, index) => (
            <div key={item.id} className="leader-item">
              <span>{index + 1}. {item.petName} ({item.players})</span>
              <span className="leader-count">{item.count} 🔥</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default App