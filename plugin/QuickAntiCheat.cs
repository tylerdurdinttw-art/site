using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Reflection;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Plugins;
using UnityEngine;
// В Oxide есть свой Time (Oxide.Core.Libraries.Time), нам нужен UnityEngine.Time.realtimeSinceStartup.
using Time = UnityEngine.Time;

namespace Oxide.Plugins
{
    [Info("QuickAntiCheat", "QuickRust", "1.0.0")]
    [Description("Серверный античит: FlyHack, SpeedHack, RapidFire, Aimbot и детект макросов по компенсации отдачи")]
    public class QuickAntiCheat : RustPlugin
    {
        #region Константы и поля

        private const string PermBypass = "quickanticheat.bypass";
        private const string PermAdmin = "quickanticheat.admin";

        // Имена data-файлов (Oxide кладёт их в oxide/data/).
        private const string DataViolations = "QuickAntiCheat/violations";
        private const string DataAlertLog = "QuickAntiCheat/alerts";
        private const string DataMacroLog = "QuickAntiCheat/macros_detail";

        // --- параметры детекта макросов, вынесенные из конфига ---
        // В конфиге остался только порог совпадения; всё остальное зафиксировано здесь.
        private const int MacroMinBurst = 7;             // минимальная длина очереди, патронов
        private const float MacroBurstResetSeconds = 0.5f; // пауза, разрывающая очередь
        private const float MacroPitchWeight = 0.6f;     // вес pitch в итоговой метрике
        private const float MacroYawWeight = 0.4f;       // вес yaw
        private const float MacroCurveBulletSpan = 30f;  // сколько патронов покрывает кривая новой отдачи
        private const int MacroMaxAlerts = 5;            // алертов до автобана

        // Оружие с выраженным паттерном отдачи. Список фиксированный — в конфиг не выносится.
        private static readonly string[] MacroWeaponList =
        {
            "rifle.ak",
            "rifle.ak.ice",
            "rifle.ak.diver",
            "rifle.lr300",
            "smg.mp5",
            "smg.thompson",
            "smg.2",
            "lmg.m249",
            "hmlmg"
        };

        private PluginConfig _config;

        // Постоянные данные (нарушения по SteamID).
        private Dictionary<ulong, ViolationRecord> _violations = new Dictionary<ulong, ViolationRecord>();
        // Журнал алертов и детальный журнал по макросам — только на запись.
        private List<AlertLogEntry> _alertLog = new List<AlertLogEntry>();
        private List<MacroLogEntry> _macroLog = new List<MacroLogEntry>();

        // Оперативное состояние игроков. Живёт только в памяти, чистится на дисконнекте.
        private readonly Dictionary<ulong, PlayerState> _states = new Dictionary<ulong, PlayerState>();

        private Timer _saveTimer;
        private Timer _burstTimer;

        // Кеш «оружие поддерживается детектом макросов» по shortname.
        private readonly HashSet<string> _macroWeapons = new HashSet<string>();

        // Отладка детекта макросов. Включается командой quickanticheat.debug 1, в конфиг не сохраняется.
        private bool _debug;
        private readonly HashSet<string> _unknownWeapons = new HashSet<string>();
        // Чтобы не спамить в консоль одной и той же причиной по каждой очереди.
        private readonly HashSet<string> _warnedRecoil = new HashSet<string>();

        #endregion

        #region Конфиг

        private class GeneralConfig
        {
            [JsonProperty("Транслировать алерты в общий чат")]
            public bool BroadcastToChat { get; set; } = true;

            [JsonProperty("Дублировать алерты в консоль сервера")]
            public bool PrintToConsole { get; set; } = true;

            [JsonProperty("SteamID64 иконки чата")]
            public ulong ChatIcon { get; set; } = 0UL;

            [JsonProperty("Формат сообщения алерта")]
            public string AlertFormat { get; set; } =
                "<color=#ff4040>[QuickAntiCheat]</color> Игрок <color=#ffcc00>{player}</color> подозревается в использовании: <color=#ff4040>{cheat}</color> ({count}/{max})";

            [JsonProperty("Формат сообщения алерта для макросов (с процентом совпадения)")]
            public string AlertFormatMacros { get; set; } =
                "<color=#ff4040>[QuickAntiCheat]</color> Игрок <color=#ffcc00>{player}</color> подозревается в использовании: <color=#ff4040>{cheat}</color> (совпадение {score}%) ({count}/{max})";

            [JsonProperty("Ссылка на Discord")]
            public string DiscordUrl { get; set; } = "https://discord.gg/quickrust";

            // Главный предохранитель от накопления за вайп: алерты должны набраться ПОДРЯД
            // за это время, иначе старые выпадают и до бана дело не доходит.
            [JsonProperty("Алерт живёт, минут")]
            public float AlertLifetimeMinutes { get; set; } = 3f;

            [JsonProperty("Удалять запись игрока через N часов без нарушений")]
            public float ViolationResetHours { get; set; } = 24f;

            [JsonProperty("Автосохранение данных, минут")]
            public float SaveIntervalMinutes { get; set; } = 5f;

            [JsonProperty("Максимум записей в журнале алертов")]
            public int AlertLogLimit { get; set; } = 5000;

            [JsonProperty("Максимум записей в детальном журнале макросов")]
            public int MacroLogLimit { get; set; } = 5000;
        }

        private class BanConfig
        {
            [JsonProperty("Включить автоматический бан")]
            public bool Enabled { get; set; } = true;

            [JsonProperty("Причина бана (доступны {cheat} и {discord})")]
            public string ReasonFormat { get; set; } =
                "{cheat} detected | Оспорить бан можно в тикете официального Discord сервера QuickRust: {discord}";

            [JsonProperty("Сообщать о бане в общий чат")]
            public bool AnnounceBan { get; set; } = true;
        }

        private class FlyConfig
        {
            [JsonProperty("Включён")] public bool Enabled { get; set; } = true;

            [JsonProperty("Реагировать на встроенный AntiHack (OnPlayerViolation)")]
            public bool UseNativeAntiHack { get; set; } = true;

            [JsonProperty("Минимальный amount встроенного AntiHack для засчёта")]
            public float NativeAmountThreshold { get; set; } = 5f;

            [JsonProperty("Порог высоты над террейном, м")]
            public float HeightThreshold { get; set; } = 3.5f;

            [JsonProperty("Сколько секунд держаться выше порога")]
            public float DurationSeconds { get; set; } = 2f;

            [JsonProperty("Алертов до бана")] public int MaxAlerts { get; set; } = 5;
        }

        private class RapidFireConfig
        {
            [JsonProperty("Включён")] public bool Enabled { get; set; } = true;

            [JsonProperty("Допуск на пинг, % от repeatDelay")]
            public float PingTolerancePercent { get; set; } = 15f;

            [JsonProperty("Дополнительный запас на серверные множители скорострельности")]
            public float ExtraToleranceMultiplier { get; set; } = 1f;

            [JsonProperty("Сколько быстрых выстрелов подряд считать нарушением")]
            public int MinConsecutive { get; set; } = 3;

            [JsonProperty("Алертов до бана")] public int MaxAlerts { get; set; } = 5;
        }

        private class SpeedConfig
        {
            [JsonProperty("Включён")] public bool Enabled { get; set; } = true;

            [JsonProperty("Максимальная скорость: ходьба")] public float MaxWalk { get; set; } = 3.0f;
            [JsonProperty("Максимальная скорость: бег")] public float MaxRun { get; set; } = 7.0f;
            [JsonProperty("Максимальная скорость: присед")] public float MaxDuck { get; set; } = 2.2f;
            [JsonProperty("Максимальная скорость: плавание")] public float MaxSwim { get; set; } = 5.0f;
            [JsonProperty("Максимальная скорость: транспорт")] public float MaxVehicle { get; set; } = 60f;
            [JsonProperty("Максимальная скорость: лошадь")] public float MaxHorse { get; set; } = 15f;
            [JsonProperty("Максимальная скорость: зиплайн")] public float MaxZipline { get; set; } = 25f;
            [JsonProperty("Множитель скорости при Wounded-бусте")] public float WoundedMultiplier { get; set; } = 1.6f;

            [JsonProperty("Множитель запаса на пинг")] public float ToleranceMultiplier { get; set; } = 1.15f;

            [JsonProperty("Сколько секунд НЕПРЕРЫВНОГО превышения до алерта")]
            public float ContinuousSeconds { get; set; } = 4f;

            [JsonProperty("Grace period после телепорта/респавна/посадки, сек")]
            public float GraceSeconds { get; set; } = 3f;

            [JsonProperty("Дистанция за тик, считающаяся телепортом, м")]
            public float TeleportDistance { get; set; } = 15f;

            [JsonProperty("Алертов до бана")] public int MaxAlerts { get; set; } = 5;
        }

        private class MacroConfig
        {
            [JsonProperty("Порог совпадения с паттерном отдачи, %")] public float MatchThreshold { get; set; } = 96f;
        }

        private class AimbotConfig
        {
            [JsonProperty("Включён")] public bool Enabled { get; set; } = true;

            [JsonProperty("Хедшот-убийств игроков")] public int Kills { get; set; } = 10;

            [JsonProperty("За сколько секунд")] public float WindowSeconds { get; set; } = 20f;

            // 1 = бан сразу при первом срабатывании. Серия такой плотности не воспроизводится честно.
            [JsonProperty("Алертов до бана")] public int MaxAlerts { get; set; } = 1;
        }

        private class PluginConfig
        {
            [JsonProperty("Общее")] public GeneralConfig General { get; set; } = new GeneralConfig();
            [JsonProperty("Бан")] public BanConfig Ban { get; set; } = new BanConfig();
            [JsonProperty("FlyHack")] public FlyConfig Fly { get; set; } = new FlyConfig();
            [JsonProperty("RapidFire")] public RapidFireConfig RapidFire { get; set; } = new RapidFireConfig();
            [JsonProperty("SpeedHack")] public SpeedConfig Speed { get; set; } = new SpeedConfig();
            [JsonProperty("Macros")] public MacroConfig Macros { get; set; } = new MacroConfig();
            [JsonProperty("Aimbot")] public AimbotConfig Aimbot { get; set; } = new AimbotConfig();
        }

        protected override void LoadDefaultConfig() => _config = new PluginConfig();

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try
            {
                _config = Config.ReadObject<PluginConfig>();
                if (_config == null) throw new Exception("config == null");
            }
            catch (Exception ex)
            {
                PrintWarning($"Конфиг повреждён ({ex.Message}), создаю новый.");
                LoadDefaultConfig();
            }

            SaveConfig();
        }

        protected override void SaveConfig() => Config.WriteObject(_config, true);

        #endregion

        #region Модели данных

        private class ViolationRecord
        {
            [JsonProperty("steamId")] public ulong SteamId { get; set; }
            [JsonProperty("name")] public string Name { get; set; } = "";
            // Времена алертов по типу чита. Не счётчик, а список: каждый алерт живёт ограниченное
            // время и сам выпадает из окна, поэтому за вайп ничего не «накапливается».
            [JsonProperty("alerts")] public Dictionary<string, List<DateTime>> Alerts { get; set; } = new Dictionary<string, List<DateTime>>();
            [JsonProperty("lastViolationUtc")] public DateTime LastViolationUtc { get; set; } = DateTime.MinValue;
            [JsonProperty("banned")] public bool Banned { get; set; }

            /// <summary>Выбрасывает алерты старше окна и возвращает список живых.</summary>
            private List<DateTime> Live(string cheat, float windowMinutes, bool create)
            {
                List<DateTime> list;
                if (!Alerts.TryGetValue(cheat, out list))
                {
                    if (!create) return null;
                    list = new List<DateTime>();
                    Alerts[cheat] = list;
                }

                var cutoff = DateTime.UtcNow.AddMinutes(-windowMinutes);
                for (int i = list.Count - 1; i >= 0; i--)
                    if (list[i] < cutoff)
                        list.RemoveAt(i);

                return list;
            }

            public int Get(string cheat, float windowMinutes)
            {
                var list = Live(cheat, windowMinutes, false);
                return list?.Count ?? 0;
            }

            public int Increment(string cheat, float windowMinutes)
            {
                var list = Live(cheat, windowMinutes, true);
                LastViolationUtc = DateTime.UtcNow;
                list.Add(LastViolationUtc);
                return list.Count;
            }
        }

        private class AlertLogEntry
        {
            [JsonProperty("timeUtc")] public string TimeUtc { get; set; }
            [JsonProperty("steamId")] public string SteamId { get; set; }
            [JsonProperty("name")] public string Name { get; set; }
            [JsonProperty("cheat")] public string Cheat { get; set; }
            [JsonProperty("count")] public int Count { get; set; }
            [JsonProperty("details")] public string Details { get; set; }
        }

        private class MacroLogEntry
        {
            [JsonProperty("timeUtc")] public string TimeUtc { get; set; }
            [JsonProperty("steamId")] public string SteamId { get; set; }
            [JsonProperty("name")] public string Name { get; set; }
            [JsonProperty("weapon")] public string Weapon { get; set; }
            [JsonProperty("burstLength")] public int BurstLength { get; set; }
            [JsonProperty("matchScore")] public float MatchScore { get; set; }
            [JsonProperty("pitchCorrelation")] public float PitchCorrelation { get; set; }
            [JsonProperty("yawCorrelation")] public float YawCorrelation { get; set; }
            [JsonProperty("referenceMode")] public string ReferenceMode { get; set; }
        }

        #endregion

        #region Оперативное состояние игрока

        private struct ShotSample
        {
            public float Pitch;
            public float Yaw;
            public float Time;
        }

        private class PlayerState
        {
            // --- общее ---
            public float GraceUntil;          // «не проверять движение» до этого времени

            // --- speed ---
            public Vector3 LastPos;
            public float LastPosTime;
            public bool HasLastPos;
            public float OverspeedSince;      // время начала непрерывного превышения (0 = нет)

            // --- fly ---
            public float AirborneSince;       // время начала «висения» выше порога (0 = нет)

            // --- rapid fire ---
            public float LastShotTime;
            public int FastShotStreak;

            // --- aimbot: времена хедшот-убийств живых игроков ---
            public readonly List<float> HeadshotKills = new List<float>();

            // --- macros ---
            public readonly List<ShotSample> Burst = new List<ShotSample>();
            public string BurstWeapon = "";
            public BaseProjectile BurstProjectile;
            public float BurstLastShotTime;

            public void ResetBurst()
            {
                Burst.Clear();
                BurstWeapon = "";
                BurstProjectile = null;
                BurstLastShotTime = 0f;
            }
        }

        private PlayerState GetState(ulong id)
        {
            PlayerState s;
            if (!_states.TryGetValue(id, out s))
            {
                s = new PlayerState();
                _states[id] = s;
            }

            return s;
        }

        #endregion

        #region Жизненный цикл

        private void Init()
        {
            permission.RegisterPermission(PermBypass, this);
            permission.RegisterPermission(PermAdmin, this);
        }

        private void OnServerInitialized()
        {
            LoadData();

            foreach (var w in MacroWeaponList)
                _macroWeapons.Add(w);

            float saveInterval = Mathf.Max(60f, _config.General.SaveIntervalMinutes * 60f);
            _saveTimer = timer.Every(saveInterval, SaveData);

            // Раз в секунду закрываем «повисшие» очереди — игрок отпустил курок и просто стоит.
            _burstTimer = timer.Every(1f, FlushStaleBursts);

            // Игроки, уже находящиеся на сервере при горячей загрузке плагина.
            foreach (var player in BasePlayer.activePlayerList)
                if (player != null)
                    GetState(player.userID).GraceUntil = Time.realtimeSinceStartup + _config.Speed.GraceSeconds;
        }

        private void Unload()
        {
            _saveTimer?.Destroy();
            _burstTimer?.Destroy();
            SaveData();
            _states.Clear();
        }

        private void OnPlayerConnected(BasePlayer player)
        {
            if (player == null) return;
            var s = GetState(player.userID);
            // После коннекта позиция ещё «прыгает» — даём фору.
            s.GraceUntil = Time.realtimeSinceStartup + Mathf.Max(5f, _config.Speed.GraceSeconds);
            s.HasLastPos = false;

            ViolationRecord rec;
            if (_violations.TryGetValue(player.userID, out rec))
                rec.Name = player.displayName;
        }

        private void OnPlayerDisconnected(BasePlayer player, string reason)
        {
            if (player == null) return;
            _states.Remove(player.userID);
        }

        private void OnPlayerRespawned(BasePlayer player)
        {
            if (player == null) return;
            var s = GetState(player.userID);
            s.GraceUntil = Time.realtimeSinceStartup + _config.Speed.GraceSeconds;
            s.HasLastPos = false;
            s.OverspeedSince = 0f;
            s.AirborneSince = 0f;
        }

        private void OnEntityMounted(BaseMountable mountable, BasePlayer player) => ApplyGrace(player);

        private void OnEntityDismounted(BaseMountable mountable, BasePlayer player) => ApplyGrace(player);

        // Хук от сторонних TP/Home плагинов (Teleportation, NTeleportation и т.п.).
        // Если плагина нет — хук просто никогда не вызовется, ошибок это не создаёт.
        [HookMethod("OnPlayerTeleported")]
        private void OnPlayerTeleportedHook(BasePlayer player, Vector3 from, Vector3 to) => ApplyGrace(player);

        private void ApplyGrace(BasePlayer player)
        {
            if (player == null || !player.IsConnected) return;
            var s = GetState(player.userID);
            s.GraceUntil = Time.realtimeSinceStartup + _config.Speed.GraceSeconds;
            s.HasLastPos = false;
            s.OverspeedSince = 0f;
            s.AirborneSince = 0f;
        }

        #endregion

        #region Фильтр «проверять ли игрока»

        /// <summary>
        /// Единая точка отсечения: NPC, спящие, мёртвые, отключившиеся и обладатели bypass не проверяются.
        /// </summary>
        private bool ShouldSkip(BasePlayer player)
        {
            if (player == null || !player.IsConnected) return true;
            // Ботов и NPC отсекаем по флагу и по невалидному SteamID64.
            ulong id = player.userID;
            if (player.IsNpc || id < 76561197960265728UL) return true;
            if (player.IsSleeping() || player.IsDead()) return true;
            if (permission.UserHasPermission(player.UserIDString, PermBypass)) return true;
            return false;
        }

        #endregion

        #region FLYHACK

        // Встроенный AntiHack Facepunch. Ничего не отменяем — только считаем нарушение.
        private void OnPlayerViolation(BasePlayer player, AntiHackType type, float amount)
        {
            if (!_config.Fly.Enabled || !_config.Fly.UseNativeAntiHack) return;
            // В enum Facepunch значение называется FlyHack (не Fly).
            if (type != AntiHackType.FlyHack) return;
            if (amount < _config.Fly.NativeAmountThreshold) return;
            if (ShouldSkip(player)) return;

            RegisterViolation(player, "FlyHack", _config.Fly.MaxAlerts,
                $"native antihack amount={amount.ToString("0.0", CultureInfo.InvariantCulture)}");
        }

        /// <summary>
        /// Собственная проверка: игрок «висит» выше террейна, при этом не в воде, не на лестнице,
        /// не в транспорте и не в свободном падении вниз.
        /// </summary>
        private void CheckFly(BasePlayer player, PlayerState s, Vector3 pos, float now, float verticalSpeed)
        {
            if (!_config.Fly.Enabled) return;

            if (player.IsOnGround() || player.IsSwimming() || player.isMounted || player.HasParent() ||
                IsOnLadder(player) || IsFlyingState(player) || player.WaterFactor() > 0.15f)
            {
                s.AirborneSince = 0f;
                return;
            }

            float terrain = TerrainMeta.HeightMap != null ? TerrainMeta.HeightMap.GetHeight(pos) : 0f;
            float height = pos.y - terrain;

            // Висим/поднимаемся высоко над землёй. Обычное падение (verticalSpeed < 0) не считаем.
            bool suspicious = height > _config.Fly.HeightThreshold && verticalSpeed > -0.5f;

            if (!suspicious)
            {
                s.AirborneSince = 0f;
                return;
            }

            if (s.AirborneSince <= 0f)
            {
                s.AirborneSince = now;
                return;
            }

            if (now - s.AirborneSince >= _config.Fly.DurationSeconds)
            {
                s.AirborneSince = 0f; // сброс, чтобы не спамить каждый тик
                RegisterViolation(player, "FlyHack", _config.Fly.MaxAlerts,
                    $"height={height.ToString("0.0", CultureInfo.InvariantCulture)}м, vSpeed={verticalSpeed.ToString("0.0", CultureInfo.InvariantCulture)}");
            }
        }

        private static bool IsOnLadder(BasePlayer player)
        {
            var ms = player.modelState;
            return ms != null && ms.onLadder;
        }

        private static bool IsFlyingState(BasePlayer player)
        {
            var ms = player.modelState;
            return ms != null && ms.flying;
        }

        #endregion

        #region AIMBOT (серия хедшот-убийств)

        /// <summary>
        /// Хук вызывается на смерть жертвы. Считаем хедшот-убийства ЖИВЫХ ИГРОКОВ, которые
        /// стрелок набрал в скользящем окне: 10 за 20 секунд честно не набирается.
        /// </summary>
        private void OnPlayerDeath(BasePlayer victim, HitInfo info)
        {
            if (!_config.Aimbot.Enabled) return;
            if (victim == null || info == null) return;
            if (!info.isHeadshot) return;

            var attacker = info.InitiatorPlayer;
            if (attacker == null) return;
            if (attacker == victim) return;              // суицид в зачёт не идёт
            if (victim.IsNpc) return;                    // животные и NPC — не «человек»
            if (ShouldSkip(attacker)) return;

            var s = GetState(attacker.userID);
            float now = Time.realtimeSinceStartup;
            float window = _config.Aimbot.WindowSeconds;

            s.HeadshotKills.Add(now);

            // Чистим всё, что вышло за окно.
            for (int i = s.HeadshotKills.Count - 1; i >= 0; i--)
                if (now - s.HeadshotKills[i] > window)
                    s.HeadshotKills.RemoveAt(i);

            if (s.HeadshotKills.Count < _config.Aimbot.Kills) return;

            int count = s.HeadshotKills.Count;
            s.HeadshotKills.Clear();

            RegisterViolation(attacker, "Aimbot", _config.Aimbot.MaxAlerts,
                $"{count} хедшот-убийств за {window.ToString("0", CultureInfo.InvariantCulture)} сек");
        }

        #endregion

        #region SPEEDHACK (OnPlayerTick)

        // Хук вызывается очень часто, поэтому тут только арифметика и сравнения — никаких аллокаций и поисков.
        private void OnPlayerTick(BasePlayer player, PlayerTick msg, bool wasPlayerStalled)
        {
            if (wasPlayerStalled) return; // тик пришёл после лага клиента — данные недостоверны
            if (ShouldSkip(player)) return;

            var s = GetState(player.userID);
            float now = Time.realtimeSinceStartup;
            Vector3 pos = player.transform.position;

            float dt = s.HasLastPos ? now - s.LastPosTime : 0f;
            float dist = s.HasLastPos ? Vector3.Distance(pos, s.LastPos) : 0f;
            float verticalSpeed = dt > 0.001f ? (pos.y - s.LastPos.y) / dt : 0f;

            // Резкий скачок = телепорт (плагин, лифт, зиплайн-старт). Даём grace и выходим.
            if (s.HasLastPos && dist > _config.Speed.TeleportDistance)
            {
                s.GraceUntil = now + _config.Speed.GraceSeconds;
                s.OverspeedSince = 0f;
                s.LastPos = pos;
                s.LastPosTime = now;
                return;
            }

            bool inGrace = now < s.GraceUntil;

            if (!inGrace && s.HasLastPos && dt > 0.05f)
            {
                CheckSpeed(player, s, dist / dt, now);
                CheckFly(player, s, pos, now, verticalSpeed);
            }
            else if (inGrace)
            {
                s.OverspeedSince = 0f;
                s.AirborneSince = 0f;
            }

            s.LastPos = pos;
            s.LastPosTime = now;
            s.HasLastPos = true;
        }

        private void CheckSpeed(BasePlayer player, PlayerState s, float speed, float now)
        {
            if (!_config.Speed.Enabled) return;

            float limit = GetSpeedLimit(player) * _config.Speed.ToleranceMultiplier;

            if (speed <= limit)
            {
                // КЛЮЧЕВОЕ: один нормальный тик обнуляет накопление. Так пинг и лаг-свитчи не дают ложняков.
                s.OverspeedSince = 0f;
                return;
            }

            if (s.OverspeedSince <= 0f)
            {
                s.OverspeedSince = now;
                return;
            }

            if (now - s.OverspeedSince >= _config.Speed.ContinuousSeconds)
            {
                s.OverspeedSince = 0f;
                RegisterViolation(player, "SpeedHack", _config.Speed.MaxAlerts,
                    $"speed={speed.ToString("0.0", CultureInfo.InvariantCulture)} м/с при лимите {limit.ToString("0.0", CultureInfo.InvariantCulture)}");
            }
        }

        /// <summary>Лимит скорости в зависимости от состояния игрока.</summary>
        private float GetSpeedLimit(BasePlayer player)
        {
            var cfg = _config.Speed;

            var mounted = player.GetMounted();
            if (mounted != null)
            {
                string prefab = mounted.ShortPrefabName ?? string.Empty;
                if (prefab.IndexOf("zipline", StringComparison.OrdinalIgnoreCase) >= 0) return cfg.MaxZipline;
                if (prefab.IndexOf("horse", StringComparison.OrdinalIgnoreCase) >= 0) return cfg.MaxHorse;
                return cfg.MaxVehicle;
            }

            // Стоя на движущемся объекте (лодка, лифт, вагонетка) — считаем как транспорт.
            if (player.HasParent()) return cfg.MaxVehicle;

            float baseLimit;
            if (player.IsSwimming()) baseLimit = cfg.MaxSwim;
            else if (player.IsDucked()) baseLimit = cfg.MaxDuck;
            else if (player.IsRunning()) baseLimit = cfg.MaxRun;
            else baseLimit = cfg.MaxWalk;

            // Раненый игрок в Rust получает кратковременный буст скорости.
            if (player.IsWounded()) baseLimit *= cfg.WoundedMultiplier;

            return baseLimit;
        }

        #endregion

        #region Выстрелы: RAPID FIRE + сбор данных для MACROS

        private void OnWeaponFired(BaseProjectile projectile, BasePlayer player, ItemModProjectile mod, ProtoBuf.ProjectileShoot projectiles)
        {
            if (projectile == null || ShouldSkip(player)) return;

            var s = GetState(player.userID);
            float now = Time.realtimeSinceStartup;

            CheckRapidFire(player, s, projectile, now);
            CollectMacroSample(player, s, projectile, now);
        }

        private void CheckRapidFire(BasePlayer player, PlayerState s, BaseProjectile projectile, float now)
        {
            if (!_config.RapidFire.Enabled)
            {
                s.LastShotTime = now;
                return;
            }

            float interval = s.LastShotTime > 0f ? now - s.LastShotTime : float.MaxValue;
            s.LastShotTime = now;

            // Длинная пауза = новая серия, стрик обнуляем.
            if (interval > 2f)
            {
                s.FastShotStreak = 0;
                return;
            }

            float expected = GetEffectiveRepeatDelay(projectile);
            if (expected <= 0f) return;

            float allowed = expected * (1f - _config.RapidFire.PingTolerancePercent / 100f) /
                            Mathf.Max(0.01f, _config.RapidFire.ExtraToleranceMultiplier);

            if (interval < allowed)
            {
                s.FastShotStreak++;
                if (s.FastShotStreak >= _config.RapidFire.MinConsecutive)
                {
                    s.FastShotStreak = 0;
                    RegisterViolation(player, "RapidFire", _config.RapidFire.MaxAlerts,
                        $"{projectile.ShortPrefabName}: интервал {(interval * 1000f).ToString("0", CultureInfo.InvariantCulture)}мс при ожидаемых {(expected * 1000f).ToString("0", CultureInfo.InvariantCulture)}мс");
                }
            }
            else
            {
                s.FastShotStreak = 0;
            }
        }

        /// <summary>
        /// Реальный repeatDelay оружия: базовое значение из объекта + множители установленных модов
        /// (Muzzle Boost и пр.). Ничего не хардкодим — иначе после апдейта Facepunch пойдут ложняки.
        /// </summary>
        private float GetEffectiveRepeatDelay(BaseProjectile projectile)
        {
            float delay = projectile.repeatDelay;
            if (delay <= 0f) return 0f;

            var item = projectile.GetItem();
            if (item?.contents?.itemList == null) return delay;

            for (int i = 0; i < item.contents.itemList.Count; i++)
            {
                var modItem = item.contents.itemList[i];
                if (modItem?.info?.itemMods == null) continue;

                for (int j = 0; j < modItem.info.itemMods.Length; j++)
                {
                    float scalar = ReadRepeatDelayScalar(modItem.info.itemMods[j]);
                    if (scalar > 0f) delay *= scalar;
                }
            }

            return delay;
        }

        // Структура ItemModWeaponMod менялась между версиями Rust, поэтому читаем её рефлексией
        // с кешем FieldInfo — так плагин переживёт очередной апдейт без правок и без падения компиляции.
        private static bool _weaponModReflectionReady;
        private static FieldInfo _fModifiers;
        private static FieldInfo _fModType;
        private static FieldInfo _fModScalar;

        private static float ReadRepeatDelayScalar(object itemMod)
        {
            if (itemMod == null) return 0f;

            // Сначала отсекаем чужие моды (ItemModProjectile и пр.), и только потом инициализируем
            // рефлексию — иначе первый же не-ItemModWeaponMod навсегда «застолбит» пустой кеш.
            if (itemMod.GetType().Name != "ItemModWeaponMod") return 0f;

            if (!_weaponModReflectionReady)
            {
                _weaponModReflectionReady = true;
                var t = itemMod.GetType();

                _fModifiers = t.GetField("modifiers", BindingFlags.Public | BindingFlags.Instance);
                var arrType = _fModifiers?.FieldType.GetElementType();
                if (arrType != null)
                {
                    _fModType = arrType.GetField("type", BindingFlags.Public | BindingFlags.Instance);
                    _fModScalar = arrType.GetField("scalar", BindingFlags.Public | BindingFlags.Instance);
                }
            }

            if (_fModifiers == null || _fModType == null || _fModScalar == null) return 0f;

            var arr = _fModifiers.GetValue(itemMod) as Array;
            if (arr == null) return 0f;

            float result = 0f;
            for (int i = 0; i < arr.Length; i++)
            {
                var entry = arr.GetValue(i);
                if (entry == null) continue;
                var typeValue = _fModType.GetValue(entry);
                if (typeValue == null) continue;
                if (!string.Equals(typeValue.ToString(), "RepeatDelay", StringComparison.OrdinalIgnoreCase)) continue;

                var scalarValue = _fModScalar.GetValue(entry);
                if (scalarValue is float) result = (float)scalarValue;
            }

            return result;
        }

        #endregion

        #region MACROS: сбор очереди

        private void CollectMacroSample(BasePlayer player, PlayerState s, BaseProjectile projectile, float now)
        {
            string shortname = projectile.GetItem()?.info?.shortname ?? projectile.ShortPrefabName ?? "";
            if (!_macroWeapons.Contains(shortname.ToLowerInvariant()))
            {
                // Оружие не из списка — если была очередь, закрываем её.
                if (s.Burst.Count > 0) EvaluateBurst(player, s);
                if (_debug && _unknownWeapons.Add(shortname))
                    Puts($"[DBG] оружие '{shortname}' не в списке детекта макросов — очереди из него не анализируются");
                return;
            }

            // Смена оружия или пауза дольше порога разрывают очередь.
            if (s.BurstWeapon != shortname || (s.BurstLastShotTime > 0f && now - s.BurstLastShotTime > MacroBurstResetSeconds))
            {
                if (s.Burst.Count > 0) EvaluateBurst(player, s);
                s.ResetBurst();
                s.BurstWeapon = shortname;
            }

            s.BurstProjectile = projectile;
            s.BurstLastShotTime = now;

            Vector3 angles = GetAimAngles(player);
            if (s.Burst.Count < 128)
                s.Burst.Add(new ShotSample { Pitch = angles.x, Yaw = angles.y, Time = now });
        }

        /// <summary>Углы обзора: приоритет — серверный инпут, запасной вариант — поворот головы.</summary>
        private static Vector3 GetAimAngles(BasePlayer player)
        {
            var input = player.serverInput;
            if (input?.current != null) return input.current.aimAngles;
            return player.eyes != null ? player.eyes.rotation.eulerAngles : Vector3.zero;
        }

        // Перезарядка обрывает очередь.
        private void OnReloadWeapon(BasePlayer player, BaseProjectile projectile) => CloseBurst(player);

        private void OnActiveItemChanged(BasePlayer player, Item oldItem, Item newItem) => CloseBurst(player);

        private void CloseBurst(BasePlayer player)
        {
            if (player == null || !player.IsConnected) return;
            PlayerState s;
            if (!_states.TryGetValue(player.userID, out s)) return;
            if (s.Burst.Count > 0) EvaluateBurst(player, s);
            s.ResetBurst();
        }

        // Буфер под ключи, чтобы не аллоцировать список каждую секунду.
        private readonly List<ulong> _flushBuffer = new List<ulong>();

        /// <summary>Раз в секунду закрываем очереди, по которым давно не было выстрелов.</summary>
        private void FlushStaleBursts()
        {
            float now = Time.realtimeSinceStartup;
            const float limit = MacroBurstResetSeconds;

            // Собираем ключи заранее: EvaluateBurst может дойти до бана, бан кикает игрока,
            // а OnPlayerDisconnected удаляет запись из _states прямо во время перебора.
            _flushBuffer.Clear();
            foreach (var kv in _states)
            {
                var st = kv.Value;
                if (st.Burst.Count == 0 || st.BurstLastShotTime <= 0f) continue;
                if (now - st.BurstLastShotTime < limit) continue;
                _flushBuffer.Add(kv.Key);
            }

            for (int i = 0; i < _flushBuffer.Count; i++)
            {
                PlayerState s;
                if (!_states.TryGetValue(_flushBuffer[i], out s)) continue;

                var player = BasePlayer.FindByID(_flushBuffer[i]);
                if (player != null && player.IsConnected && !ShouldSkip(player))
                    EvaluateBurst(player, s);

                s.ResetBurst();
            }
        }

        #endregion

        #region MACROS: анализ очереди

        private void EvaluateBurst(BasePlayer player, PlayerState s)
        {
            int n = s.Burst.Count;
            if (n < MacroMinBurst)
            {
                if (_debug && n > 0)
                    Puts($"[DBG] {player.displayName}: очередь {s.BurstWeapon} длиной {n} — короче минимума {MacroMinBurst}, пропуск");
                return;
            }

            // 1. Вектор компенсации игрока: дельты углов между соседними выстрелами.
            int m = n - 1;
            var playerPitch = new float[m];
            var playerYaw = new float[m];

            for (int i = 0; i < m; i++)
            {
                playerPitch[i] = NormalizeAngle(s.Burst[i + 1].Pitch - s.Burst[i].Pitch);
                playerYaw[i] = NormalizeAngle(s.Burst[i + 1].Yaw - s.Burst[i].Yaw);
            }

            // 2. Данные об отдаче, вычитанные из самого оружия.
            string reason;
            RecoilReference reference;
            if (!BuildRecoilReference(s.BurstProjectile, m, out reference, out reason))
            {
                // Прочитать не удалось — молчим (ложняки дороже пропуска), но один раз пишем причину:
                // без этого детект «просто не работает» и понять почему невозможно.
                WarnRecoilOnce(s.BurstWeapon, reason);
                return;
            }

            // 3. Метрика совпадения — единственный критерий детекта.
            float rPitch, rYaw;
            string detail;

            if (reference.Mode == "curve")
            {
                // Новая система отдачи: у паттерна есть форма, сравниваем её корреляцией.
                rPitch = ShapeSimilarity(playerPitch, reference.Pitch);
                rYaw = ShapeSimilarity(playerYaw, reference.Yaw);
                detail = "";
            }
            else
            {
                // Старая система: отдача случайна в [min;max], формы нет. Сравнивать не с чем,
                // поэтому смотрим на статистику наблюдаемых дельт (см. AxisScore).
                rPitch = AxisScore(playerPitch, reference.PitchMean, reference.PitchSigma, out detail);
                string yawDetail;
                rYaw = AxisScore(playerYaw, reference.YawMean, reference.YawSigma, out yawDetail);
                detail = "pitch[" + detail + "] yaw[" + yawDetail + "]";
            }

            float matchScore = Mathf.Clamp((rPitch * MacroPitchWeight + rYaw * MacroYawWeight) * 100f, 0f, 100f);

            // Детальный лог пишем по каждой очереди — он нужен для разбора спорных банов.
            LogMacro(player, s, n, matchScore, rPitch * 100f, rYaw * 100f, reference.Mode);

            if (_debug)
                Puts($"[DBG] {player.displayName}: {s.BurstWeapon}, очередь {n}, mode={reference.Mode}, " +
                     $"pitch={(rPitch * 100f).ToString("0.0", CultureInfo.InvariantCulture)}, " +
                     $"yaw={(rYaw * 100f).ToString("0.0", CultureInfo.InvariantCulture)}, " +
                     $"match={matchScore.ToString("0.0", CultureInfo.InvariantCulture)}% " +
                     $"(порог {_config.Macros.MatchThreshold.ToString("0.0", CultureInfo.InvariantCulture)}%) {detail}");

            if (matchScore < _config.Macros.MatchThreshold) return;

            string referenceMode = reference.Mode;

            RegisterViolation(player, "Macros", MacroMaxAlerts,
                $"{s.BurstWeapon}, очередь {n}, match={matchScore.ToString("0.0", CultureInfo.InvariantCulture)}%, mode={referenceMode}",
                matchScore);
        }

        /// <summary>
        /// Оценка одной оси для оружия со случайной отдачей (режим minmax).
        ///
        /// Ключевой момент: aimAngles содержат ИТОГОВЫЙ угол обзора, то есть отдачу и компенсацию
        /// вместе. Поэтому наблюдаемая дельта между выстрелами = отдача + движение мыши игрока.
        /// Отсюда два признака макроса:
        ///   1) он реально гасит отдачу — средняя дельта близка к нулю, а не к средней отдаче;
        ///   2) он гасит её одинаково — весь разброс дельт объясняется случайностью самой отдачи,
        ///      собственного дрожания руки поверх неё нет.
        /// Человек проваливает второй пункт: его компенсация добавляет разброс сверх отдачи.
        /// </summary>
        private static float AxisScore(float[] deltas, float recoilMean, float recoilSigma, out string detail)
        {
            float obsMean = 0f;
            for (int i = 0; i < deltas.Length; i++) obsMean += deltas[i];
            obsMean /= deltas.Length;

            float obsSigma = Mathf.Sqrt(Variance(deltas));

            // 1. Насколько погашена средняя отдача. 1 = дельта около нуля, 0 = не компенсирует вовсе.
            float compensation = 1f;
            if (Mathf.Abs(recoilMean) > 1e-4f)
                compensation = Mathf.Clamp01(1f - Mathf.Abs(obsMean) / Mathf.Abs(recoilMean));

            // 2. Сколько разброса добавил сам игрок сверх случайности отдачи.
            float consistency;
            if (recoilSigma > 1e-4f)
            {
                float residual = Mathf.Max(0f, obsSigma * obsSigma - recoilSigma * recoilSigma);
                consistency = Mathf.Clamp01(1f - Mathf.Sqrt(residual) / recoilSigma);
            }
            else
            {
                // Отдача детерминированная: любой разброс дельт — это уже рука игрока.
                consistency = Mathf.Clamp01(1f - obsSigma / Mathf.Max(1e-4f, Mathf.Abs(recoilMean)));
            }

            detail = $"obsMean={obsMean.ToString("0.00", CultureInfo.InvariantCulture)}/" +
                     $"{recoilMean.ToString("0.00", CultureInfo.InvariantCulture)} " +
                     $"obsSd={obsSigma.ToString("0.00", CultureInfo.InvariantCulture)}/" +
                     $"{recoilSigma.ToString("0.00", CultureInfo.InvariantCulture)} " +
                     $"comp={compensation.ToString("0.00", CultureInfo.InvariantCulture)} " +
                     $"cons={consistency.ToString("0.00", CultureInfo.InvariantCulture)}";

            // Оба признака обязательны: тот, кто просто не двигает мышью, получит compensation ≈ 0.
            return compensation * consistency;
        }

        #endregion

        #region MACROS: чтение паттерна отдачи из оружия

        // BaseProjectile.recoil / RecoilProperties — поля, которые Facepunch регулярно переименовывает.
        // Читаем рефлексией с кешем ПО ТИПУ: FieldInfo, полученный у одного типа, нельзя применять
        // к объекту другого типа (GetValue кинет ArgumentException) — а newRecoilOverride как раз
        // может вернуть объект другого класса.
        private const BindingFlags RFlags = BindingFlags.Public | BindingFlags.Instance;

        private class RecoilFields
        {
            public FieldInfo NewOverride;
            public FieldInfo OverrideCurve, PitchCurve, YawCurve;
            public FieldInfo PitchMin, PitchMax, YawMin, YawMax;
            public bool AnyUsable => (PitchCurve != null && YawCurve != null) || (PitchMin != null && PitchMax != null);
        }

        private static readonly Dictionary<Type, FieldInfo> _projectileRecoilField = new Dictionary<Type, FieldInfo>();
        private static readonly Dictionary<Type, RecoilFields> _recoilFieldCache = new Dictionary<Type, RecoilFields>();

        private static FieldInfo GetProjectileRecoilField(Type projectileType)
        {
            FieldInfo fi;
            if (_projectileRecoilField.TryGetValue(projectileType, out fi)) return fi;

            fi = projectileType.GetField("recoil", RFlags);
            _projectileRecoilField[projectileType] = fi;
            return fi;
        }

        private static RecoilFields GetRecoilFields(Type recoilType)
        {
            RecoilFields rf;
            if (_recoilFieldCache.TryGetValue(recoilType, out rf)) return rf;

            rf = new RecoilFields
            {
                NewOverride = recoilType.GetField("newRecoilOverride", RFlags),
                OverrideCurve = recoilType.GetField("overrideAimconeWithCurve", RFlags),
                PitchCurve = recoilType.GetField("recoilPitchCurve", RFlags),
                YawCurve = recoilType.GetField("recoilYawCurve", RFlags),
                PitchMin = recoilType.GetField("recoilPitchMin", RFlags),
                PitchMax = recoilType.GetField("recoilPitchMax", RFlags),
                YawMin = recoilType.GetField("recoilYawMin", RFlags),
                YawMax = recoilType.GetField("recoilYawMax", RFlags)
            };

            _recoilFieldCache[recoilType] = rf;
            return rf;
        }

        /// <summary>Данные об отдаче оружия, приведённые к виду, пригодному для сравнения.</summary>
        private class RecoilReference
        {
            public string Mode = "none";
            // Режим curve: эталонные дельты по выстрелам.
            public float[] Pitch;
            public float[] Yaw;
            // Режим minmax: параметры распределения отдачи на один выстрел.
            public float PitchMean, PitchSigma, YawMean, YawSigma;
            public float PitchMin, PitchMax, YawMin, YawMax;
        }

        /// <summary>
        /// Читает отдачу оружия. Новая система (кривые) даёт форму паттерна;
        /// старая (min/max) — только распределение случайной отдачи на выстрел.
        /// reason заполняется всегда — по нему видно, почему прочитать не удалось.
        /// </summary>
        private bool BuildRecoilReference(BaseProjectile projectile, int count, out RecoilReference reference, out string reason)
        {
            reference = null;
            reason = "";

            if (projectile == null) { reason = "projectile == null"; return false; }
            if (count < 2) { reason = "count < 2"; return false; }

            var recoilField = GetProjectileRecoilField(projectile.GetType());
            if (recoilField == null) { reason = $"у {projectile.GetType().Name} нет публичного поля 'recoil'"; return false; }

            object recoil = recoilField.GetValue(projectile);
            if (recoil == null) { reason = "поле recoil пустое (у оружия не назначен RecoilProperties)"; return false; }

            var rf = GetRecoilFields(recoil.GetType());

            // Переопределение новой отдачи приоритетнее. Тип объекта может отличаться —
            // поэтому после подмены заново берём набор полей для его типа.
            if (rf.NewOverride != null)
            {
                object over = rf.NewOverride.GetValue(recoil);
                if (over != null)
                {
                    recoil = over;
                    rf = GetRecoilFields(recoil.GetType());
                }
            }

            if (!rf.AnyUsable)
            {
                reason = $"в {recoil.GetType().Name} не найдено ни кривых, ни recoilPitchMin/Max";
                return false;
            }

            // --- вариант 1: кривые (новая система отдачи) ---
            bool useCurves = true; // если флага нет, но кривые заполнены — используем их
            if (rf.OverrideCurve != null)
            {
                object v = rf.OverrideCurve.GetValue(recoil);
                if (v is bool) useCurves = (bool)v;
            }

            var pitchCurve = rf.PitchCurve?.GetValue(recoil) as AnimationCurve;
            var yawCurve = rf.YawCurve?.GetValue(recoil) as AnimationCurve;

            if (useCurves && pitchCurve != null && yawCurve != null && pitchCurve.length > 1 && yawCurve.length > 1)
            {
                reference = new RecoilReference
                {
                    Mode = "curve",
                    Pitch = SampleCurveDeltas(pitchCurve, count),
                    Yaw = SampleCurveDeltas(yawCurve, count)
                };
                return true;
            }

            // --- вариант 2: классические min/max ---
            float pMin = ReadFloat(recoil, rf.PitchMin);
            float pMax = ReadFloat(recoil, rf.PitchMax);
            float yMin = ReadFloat(recoil, rf.YawMin);
            float yMax = ReadFloat(recoil, rf.YawMax);

            if (Mathf.Approximately(pMin, 0f) && Mathf.Approximately(pMax, 0f))
            {
                reason = $"recoilPitchMin/Max нулевые в {recoil.GetType().Name}";
                return false;
            }

            // Отдача на выстрел равномерно распределена в [min;max]: среднее — середина отрезка,
            // дисперсия равномерного распределения — (max-min)^2 / 12.
            const float sqrt12 = 3.4641016f;

            reference = new RecoilReference
            {
                Mode = "minmax",
                PitchMin = pMin,
                PitchMax = pMax,
                YawMin = yMin,
                YawMax = yMax,
                PitchMean = (pMin + pMax) * 0.5f,
                YawMean = (yMin + yMax) * 0.5f,
                PitchSigma = Mathf.Abs(pMax - pMin) / sqrt12,
                YawSigma = Mathf.Abs(yMax - yMin) / sqrt12
            };

            return true;
        }

        private float[] SampleCurveDeltas(AnimationCurve curve, int count)
        {
            const float span = MacroCurveBulletSpan;
            float end = curve[curve.length - 1].time;
            float start = curve[0].time;

            var result = new float[count];
            float prev = curve.Evaluate(start);

            for (int i = 0; i < count; i++)
            {
                float t = start + (end - start) * Mathf.Clamp01((i + 1) / span);
                float cur = curve.Evaluate(t);
                result[i] = -(cur - prev); // инверсия: игрок тянет мышь против кривой
                prev = cur;
            }

            return result;
        }

        /// <summary>Одно предупреждение на оружие: паттерн отдачи прочитать не удалось, детект по нему мёртв.</summary>
        private void WarnRecoilOnce(string weapon, string reason)
        {
            if (string.IsNullOrEmpty(reason)) return;
            if (!_warnedRecoil.Add(weapon + "|" + reason)) return;
            PrintWarning($"Детект макросов для '{weapon}' отключён: {reason}");
        }

        private static string Fmt(float v) => v.ToString("0.000", CultureInfo.InvariantCulture);

        private static float ReadFloat(object obj, FieldInfo field)
        {
            if (obj == null || field == null) return 0f;
            object v = field.GetValue(obj);
            return v is float ? (float)v : 0f;
        }

        #endregion

        #region Математика

        private static float NormalizeAngle(float angle)
        {
            angle %= 360f;
            if (angle > 180f) angle -= 360f;
            else if (angle < -180f) angle += 360f;
            return angle;
        }

        /// <summary>
        /// Совпадение формы траектории с эталоном, 0..1. Только для режима curve, где у паттерна
        /// есть форма. Модуль корреляции — чтобы не зависеть от знаковой конвенции aimAngles.
        /// </summary>
        private static float ShapeSimilarity(float[] player, float[] reference)
        {
            if (player == null || reference == null || player.Length < 3 || player.Length != reference.Length) return 0f;
            if (Variance(reference) <= 1e-8f) return 0f;
            return Mathf.Clamp01(Mathf.Abs(Pearson(player, reference)));
        }

        private static float Pearson(float[] a, float[] b)
        {
            int n = a.Length;
            float ma = 0f, mb = 0f;
            for (int i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
            ma /= n; mb /= n;

            float cov = 0f, va = 0f, vb = 0f;
            for (int i = 0; i < n; i++)
            {
                float da = a[i] - ma;
                float db = b[i] - mb;
                cov += da * db;
                va += da * da;
                vb += db * db;
            }

            float denom = Mathf.Sqrt(va * vb);
            return denom < 1e-8f ? 0f : cov / denom;
        }

        private static float Variance(float[] v)
        {
            if (v == null || v.Length < 2) return 0f;
            float mean = 0f;
            for (int i = 0; i < v.Length; i++) mean += v[i];
            mean /= v.Length;

            float sum = 0f;
            for (int i = 0; i < v.Length; i++)
            {
                float d = v[i] - mean;
                sum += d * d;
            }

            return sum / v.Length;
        }

        #endregion

        #region Нарушения, алерты, бан

        /// <summary>Единая точка: инкремент счётчика, алерт в чат/консоль/лог и бан по достижении лимита.</summary>
        private void RegisterViolation(BasePlayer player, string cheat, int maxAlerts, string details, float matchScore = -1f)
        {
            if (player == null || !player.IsConnected) return;

            var rec = GetRecord(player.userID, player.displayName);
            // Счётчик — это число живых алертов в окне. Всё, что старше, уже выпало.
            int count = rec.Increment(cheat, _config.General.AlertLifetimeMinutes);

            string scoreText = matchScore >= 0f ? matchScore.ToString("0.0", CultureInfo.InvariantCulture) : "";
            string message = (matchScore >= 0f ? _config.General.AlertFormatMacros : _config.General.AlertFormat)
                .Replace("{player}", player.displayName)
                .Replace("{cheat}", cheat)
                .Replace("{count}", count.ToString())
                .Replace("{max}", maxAlerts.ToString())
                .Replace("{score}", scoreText);

            BroadcastAlert(message);

            if (_config.General.PrintToConsole)
                Puts($"[ALERT] {player.displayName} ({player.userID}) — {cheat} ({count}/{maxAlerts}) | {details}");

            _alertLog.Add(new AlertLogEntry
            {
                TimeUtc = DateTime.UtcNow.ToString("u"),
                SteamId = player.UserIDString,
                Name = player.displayName,
                Cheat = cheat,
                Count = count,
                Details = details
            });
            TrimLog(_alertLog, _config.General.AlertLogLimit);

            if (count >= maxAlerts)
            {
                rec.Alerts.Remove(cheat);
                BanPlayer(player, cheat, rec);
            }
        }

        private void BroadcastAlert(string message)
        {
            if (_config.General.BroadcastToChat)
            {
                foreach (var p in BasePlayer.activePlayerList)
                    SendChat(p, message);
                return;
            }

            // Тихий режим: алерт видят только админы.
            foreach (var p in BasePlayer.activePlayerList)
            {
                if (p == null || !p.IsConnected) continue;
                if (!permission.UserHasPermission(p.UserIDString, PermAdmin)) continue;
                SendChat(p, message);
            }
        }

        private void SendChat(BasePlayer player, string message)
        {
            if (player == null || !player.IsConnected) return;
            player.SendConsoleCommand("chat.add", 2, _config.General.ChatIcon, message);
        }

        private void BanPlayer(BasePlayer player, string cheat, ViolationRecord rec)
        {
            string reason = _config.Ban.ReasonFormat
                .Replace("{cheat}", cheat)
                .Replace("{discord}", _config.General.DiscordUrl);

            rec.Banned = true;

            _alertLog.Add(new AlertLogEntry
            {
                TimeUtc = DateTime.UtcNow.ToString("u"),
                SteamId = player.UserIDString,
                Name = player.displayName,
                Cheat = cheat,
                Count = -1,
                Details = "BAN: " + reason
            });

            Puts($"[BAN] {player.displayName} ({player.userID}) — {reason}");

            if (_config.Ban.AnnounceBan)
                BroadcastAlert(Lang("BanAnnounce", null, player.displayName, cheat));

            if (!_config.Ban.Enabled)
            {
                Puts("[BAN] Автобан выключен в конфиге — игрок оставлен на сервере.");
                return;
            }

            ulong id = player.userID;
            string name = player.displayName;

            // Кикаем сразу, запись в бан-лист делаем через штатную серверную команду.
            player.Kick(reason);
            Server.Command($"ban {id} \"{EscapeQuotes(reason)}\"");
            Puts($"[BAN] {name} ({id}) забанен.");

            SaveData();
        }

        private static string EscapeQuotes(string s) => string.IsNullOrEmpty(s) ? "" : s.Replace("\"", "'");

        private void LogMacro(BasePlayer player, PlayerState s, int burstLength, float match, float rPitch, float rYaw, string mode)
        {
            _macroLog.Add(new MacroLogEntry
            {
                TimeUtc = DateTime.UtcNow.ToString("u"),
                SteamId = player.UserIDString,
                Name = player.displayName,
                Weapon = s.BurstWeapon,
                BurstLength = burstLength,
                MatchScore = (float)Math.Round(match, 2),
                PitchCorrelation = (float)Math.Round(rPitch, 2),
                YawCorrelation = (float)Math.Round(rYaw, 2),
                ReferenceMode = mode
            });
            TrimLog(_macroLog, _config.General.MacroLogLimit);
        }

        private static void TrimLog<T>(List<T> log, int limit)
        {
            if (limit <= 0) return;
            int excess = log.Count - limit;
            if (excess > 0) log.RemoveRange(0, excess);
        }

        #endregion

        #region Данные

        private ViolationRecord GetRecord(ulong id, string name)
        {
            ViolationRecord rec;
            if (!_violations.TryGetValue(id, out rec))
            {
                rec = new ViolationRecord { SteamId = id, Name = name };
                _violations[id] = rec;
            }

            if (!string.IsNullOrEmpty(name)) rec.Name = name;
            return rec;
        }

        private void LoadData()
        {
            try
            {
                _violations = Interface.Oxide.DataFileSystem.ReadObject<Dictionary<ulong, ViolationRecord>>(DataViolations)
                              ?? new Dictionary<ulong, ViolationRecord>();
            }
            catch (Exception ex)
            {
                PrintWarning($"Не удалось прочитать {DataViolations}: {ex.Message}. Начинаю с пустых данных.");
                _violations = new Dictionary<ulong, ViolationRecord>();
            }

            try
            {
                _alertLog = Interface.Oxide.DataFileSystem.ReadObject<List<AlertLogEntry>>(DataAlertLog) ?? new List<AlertLogEntry>();
            }
            catch { _alertLog = new List<AlertLogEntry>(); }

            try
            {
                _macroLog = Interface.Oxide.DataFileSystem.ReadObject<List<MacroLogEntry>>(DataMacroLog) ?? new List<MacroLogEntry>();
            }
            catch { _macroLog = new List<MacroLogEntry>(); }

            ExpireOldRecords();
        }

        private void SaveData()
        {
            ExpireOldRecords();

            try
            {
                Interface.Oxide.DataFileSystem.WriteObject(DataViolations, _violations);
                Interface.Oxide.DataFileSystem.WriteObject(DataAlertLog, _alertLog);
                Interface.Oxide.DataFileSystem.WriteObject(DataMacroLog, _macroLog);
            }
            catch (Exception ex)
            {
                PrintError($"Ошибка сохранения данных: {ex.Message}");
            }
        }

        /// <summary>Сброс счётчиков у тех, кто не нарушал дольше ViolationResetHours.</summary>
        private void ExpireOldRecords()
        {
            if (_config == null) return;

            double hours = _config.General.ViolationResetHours;
            if (hours <= 0) return;

            var cutoff = DateTime.UtcNow.AddHours(-hours);
            var toRemove = new List<ulong>();

            foreach (var kv in _violations)
            {
                var rec = kv.Value;
                if (rec.LastViolationUtc > cutoff) continue;
                if (rec.Banned) continue; // историю банов не чистим
                toRemove.Add(kv.Key);
            }

            for (int i = 0; i < toRemove.Count; i++)
                _violations.Remove(toRemove[i]);
        }

        #endregion

        #region Команды

        [ChatCommand("ac")]
        private void CmdAc(BasePlayer player, string command, string[] args)
        {
            if (player == null) return;

            if (!permission.UserHasPermission(player.UserIDString, PermAdmin))
            {
                SendChat(player, Lang("NoPermission", player.UserIDString));
                return;
            }

            if (args == null || args.Length < 2)
            {
                SendChat(player, Lang("Usage", player.UserIDString));
                return;
            }

            string sub = args[0].ToLowerInvariant();
            string target = string.Join(" ", args.Skip(1).ToArray());

            ViolationRecord rec;
            string resolvedName;
            if (!TryResolve(target, out rec, out resolvedName))
            {
                SendChat(player, Lang("PlayerNotFound", player.UserIDString, target));
                return;
            }

            switch (sub)
            {
                case "stats":
                    SendChat(player, Lang("StatsHeader", player.UserIDString, resolvedName, rec.SteamId,
                        _config.General.AlertLifetimeMinutes.ToString("0.#", CultureInfo.InvariantCulture)));
                    foreach (var cheat in new[] { "Macros", "Aimbot", "SpeedHack", "FlyHack", "RapidFire" })
                        SendChat(player, Lang("StatsLine", player.UserIDString, cheat, rec.Get(cheat, _config.General.AlertLifetimeMinutes)));
                    SendChat(player, Lang("StatsLast", player.UserIDString,
                        rec.LastViolationUtc == DateTime.MinValue ? "-" : rec.LastViolationUtc.ToString("u")));
                    break;

                case "reset":
                    rec.Alerts.Clear();
                    rec.LastViolationUtc = DateTime.MinValue;
                    SaveData();
                    SendChat(player, Lang("ResetDone", player.UserIDString, resolvedName));
                    Puts($"{player.displayName} сбросил счётчики QuickAntiCheat для {resolvedName} ({rec.SteamId}).");
                    break;

                default:
                    SendChat(player, Lang("Usage", player.UserIDString));
                    break;
            }
        }

        /// <summary>Ищет игрока по SteamID, точному нику или подстроке — сначала онлайн, затем в данных.</summary>
        private bool TryResolve(string input, out ViolationRecord rec, out string name)
        {
            rec = null;
            name = input;

            ulong id;
            if (ulong.TryParse(input, out id))
            {
                var online = BasePlayer.FindByID(id);
                rec = GetRecord(id, online?.displayName);
                name = rec.Name ?? input;
                return true;
            }

            foreach (var p in BasePlayer.activePlayerList)
            {
                if (p == null) continue;
                if (p.displayName.IndexOf(input, StringComparison.OrdinalIgnoreCase) < 0) continue;
                rec = GetRecord(p.userID, p.displayName);
                name = p.displayName;
                return true;
            }

            foreach (var kv in _violations)
            {
                if (string.IsNullOrEmpty(kv.Value.Name)) continue;
                if (kv.Value.Name.IndexOf(input, StringComparison.OrdinalIgnoreCase) < 0) continue;
                rec = kv.Value;
                name = kv.Value.Name;
                return true;
            }

            return false;
        }

        // Консольный аналог для RCON: quickanticheat.stats <ник|steamid>
        [ConsoleCommand("quickanticheat.stats")]
        private void CcmdStats(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !permission.UserHasPermission(arg.Player().UserIDString, PermAdmin)) return;
            if (!arg.HasArgs(1)) { arg.ReplyWith("quickanticheat.stats <ник|steamid>"); return; }

            ViolationRecord rec;
            string name;
            if (!TryResolve(arg.GetString(0), out rec, out name))
            {
                arg.ReplyWith("Игрок не найден.");
                return;
            }

            var lines = new List<string> { $"{name} ({rec.SteamId}) banned={rec.Banned}" };
            foreach (var cheat in new[] { "Macros", "Aimbot", "SpeedHack", "FlyHack", "RapidFire" })
                lines.Add($"  {cheat}: {rec.Get(cheat, _config.General.AlertLifetimeMinutes)}");

            arg.ReplyWith(string.Join("\n", lines.ToArray()));
        }

        // Включает подробный лог по каждой закрытой очереди: quickanticheat.debug 1
        [ConsoleCommand("quickanticheat.debug")]
        private void CcmdDebug(ConsoleSystem.Arg arg)
        {
            if (arg.Player() != null && !permission.UserHasPermission(arg.Player().UserIDString, PermAdmin)) return;

            _debug = arg.HasArgs(1) ? arg.GetBool(0) : !_debug;
            if (!_debug)
            {
                _unknownWeapons.Clear();
                _warnedRecoil.Clear();
            }

            arg.ReplyWith($"QuickAntiCheat: отладка макросов {(_debug ? "включена" : "выключена")}.");
        }

        /// <summary>
        /// Диагностика: показывает, читается ли паттерн отдачи у оружия в руках.
        /// Запускать в игровой консоли (F1), держа нужное оружие.
        /// </summary>
        [ConsoleCommand("quickanticheat.recoil")]
        private void CcmdRecoil(ConsoleSystem.Arg arg)
        {
            var player = arg.Player();
            if (player == null) { arg.ReplyWith("Команду нужно выполнять в игровой консоли (F1), держа оружие в руках."); return; }
            if (!permission.UserHasPermission(player.UserIDString, PermAdmin)) return;

            var weapon = player.GetHeldEntity() as BaseProjectile;
            if (weapon == null) { arg.ReplyWith("В руках нет огнестрельного оружия."); return; }

            string shortname = weapon.GetItem()?.info?.shortname ?? weapon.ShortPrefabName ?? "?";
            bool inList = _macroWeapons.Contains(shortname.ToLowerInvariant());

            string reason;
            RecoilReference r;
            bool ok = BuildRecoilReference(weapon, MacroMinBurst - 1, out r, out reason);

            var lines = new List<string>
            {
                $"оружие: {shortname} ({weapon.GetType().Name})",
                $"в списке детекта: {(inList ? "да" : "НЕТ — очереди игнорируются")}",
                $"repeatDelay: {GetEffectiveRepeatDelay(weapon).ToString("0.000", CultureInfo.InvariantCulture)} с",
                $"отдача: {(ok ? $"прочитана, режим {r.Mode}" : $"НЕ прочитана — {reason}")}"
            };

            if (ok && r.Mode == "curve")
            {
                lines.Add("эталон pitch: " + string.Join(", ", r.Pitch.Select(v => v.ToString("0.000", CultureInfo.InvariantCulture)).ToArray()));
                lines.Add("эталон yaw:   " + string.Join(", ", r.Yaw.Select(v => v.ToString("0.000", CultureInfo.InvariantCulture)).ToArray()));
            }
            else if (ok)
            {
                lines.Add($"pitch: min={Fmt(r.PitchMin)} max={Fmt(r.PitchMax)} mean={Fmt(r.PitchMean)} sigma={Fmt(r.PitchSigma)}");
                lines.Add($"yaw:   min={Fmt(r.YawMin)} max={Fmt(r.YawMax)} mean={Fmt(r.YawMean)} sigma={Fmt(r.YawSigma)}");
                lines.Add("форма паттерна отсутствует (отдача случайна) — используется статистический критерий");
            }

            arg.ReplyWith(string.Join("\n", lines.ToArray()));
        }

        #endregion

        #region Локализация

        protected override void LoadDefaultMessages()
        {
            lang.RegisterMessages(new Dictionary<string, string>
            {
                ["NoPermission"] = "<color=#ff4040>[QuickAntiCheat]</color> У вас нет доступа к этой команде.",
                ["Usage"] = "<color=#ff4040>[QuickAntiCheat]</color> Использование: /ac stats <ник> | /ac reset <ник>",
                ["PlayerNotFound"] = "<color=#ff4040>[QuickAntiCheat]</color> Игрок «{0}» не найден.",
                ["StatsHeader"] = "<color=#ff4040>[QuickAntiCheat]</color> Живые алерты игрока <color=#ffcc00>{0}</color> ({1}) за последние {2} мин:",
                ["StatsLine"] = "  <color=#ffcc00>{0}</color>: {1}",
                ["StatsLast"] = "  Последнее нарушение: {0}",
                ["ResetDone"] = "<color=#ff4040>[QuickAntiCheat]</color> Счётчики игрока <color=#ffcc00>{0}</color> сброшены.",
                ["BanAnnounce"] = "<color=#ff4040>[QuickAntiCheat]</color> Игрок <color=#ffcc00>{0}</color> заблокирован за <color=#ff4040>{1}</color>."
            }, this, "ru");

            lang.RegisterMessages(new Dictionary<string, string>
            {
                ["NoPermission"] = "<color=#ff4040>[QuickAntiCheat]</color> You don't have access to this command.",
                ["Usage"] = "<color=#ff4040>[QuickAntiCheat]</color> Usage: /ac stats <name> | /ac reset <name>",
                ["PlayerNotFound"] = "<color=#ff4040>[QuickAntiCheat]</color> Player \"{0}\" not found.",
                ["StatsHeader"] = "<color=#ff4040>[QuickAntiCheat]</color> Active alerts of <color=#ffcc00>{0}</color> ({1}) within last {2} min:",
                ["StatsLine"] = "  <color=#ffcc00>{0}</color>: {1}",
                ["StatsLast"] = "  Last violation: {0}",
                ["ResetDone"] = "<color=#ff4040>[QuickAntiCheat]</color> Counters for <color=#ffcc00>{0}</color> have been reset.",
                ["BanAnnounce"] = "<color=#ff4040>[QuickAntiCheat]</color> Player <color=#ffcc00>{0}</color> was banned for <color=#ff4040>{1}</color>."
            }, this, "en");
        }

        private string Lang(string key, string userId = null, params object[] args)
        {
            string format = lang.GetMessage(key, this, userId);
            return args != null && args.Length > 0 ? string.Format(format, args) : format;
        }

        #endregion
    }
}
