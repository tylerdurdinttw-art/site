using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using Newtonsoft.Json;
using Oxide.Core;
using Oxide.Core.Libraries;
using Oxide.Core.Plugins;
using Oxide.Game.Rust.Cui;
using UnityEngine;
// Time есть и в Oxide.Core.Libraries, и в UnityEngine — нам нужен второй (realtimeSinceStartup).
using Time = UnityEngine.Time;

namespace Oxide.Plugins
{
    [Info("YnaziCotTvBridge", "YnaziCotTV", "1.5.0")]
    [Description("Мост между игровым сервером Rust и веб-панелью YnaziCotTV: heartbeat, события, античит-статистика")]
    public class YnaziCotTvBridge : RustPlugin
    {
        #region Конфиг

        private PluginConfig _config;

        private class AntiCheatConfig
        {
            [JsonProperty("Enabled")] public bool Enabled { get; set; } = true;
            [JsonProperty("ReportViolations")] public bool ReportViolations { get; set; } = true;
            [JsonProperty("HeadshotRatioThreshold")] public float HeadshotRatioThreshold { get; set; } = 0.75f;
            [JsonProperty("MinShotsForRatio")] public int MinShotsForRatio { get; set; } = 40;
            [JsonProperty("MaxShotsPerSecond")] public int MaxShotsPerSecond { get; set; } = 12;
            [JsonProperty("MaxKillDistance")] public float MaxKillDistance { get; set; } = 350f;
        }

        private class ReportsConfig
        {
            [JsonProperty("Enabled")] public bool Enabled { get; set; } = true;
            /// Чат-команда, открывающая меню репортов. Без слэша.
            [JsonProperty("Command")] public string Command { get; set; } = "report";
            /// Пауза между репортами на одного и того же игрока от одного и того же жалобщика.
            [JsonProperty("CooldownSec")] public int CooldownSec { get; set; } = 600;
            /// Аватарки в меню рисует сам клиент по SteamID. Выключите, если они мешают.
            [JsonProperty("LoadAvatars")] public bool LoadAvatars { get; set; } = true;
            /// Replace обязателен: по умолчанию Newtonsoft не создаёт список заново, а дописывает
            /// в уже существующий — тот, что задан здесь инициализатором. Без него причины из файла
            /// прибавлялись бы к пяти стандартным на каждой загрузке, и конфиг рос бы с каждым reload.
            [JsonProperty("Reasons", ObjectCreationHandling = ObjectCreationHandling.Replace)]
            public List<string> Reasons { get; set; } = new List<string>
            {
                "Cheating", "Insults", "Spam", "Bug abuse", "Other"
            };
        }

        /// Вебхуки Discord. Сообщения уходят прямо отсюда, с игрового сервера:
        /// панели по пути нет, поэтому её доступ к discord.com не важен — важен только
        /// доступ этого сервера. Адреса берутся в Discord: настройки канала →
        /// Интеграции → Вебхуки → Копировать URL.
        private class DiscordConfig
        {
            /// Канал бан-листа: сюда уходят выданные и снятые блокировки. Пусто — не слать.
            [JsonProperty("BansWebhook")] public string BansWebhook { get; set; } = "";
            /// Канал репортов: сюда уходят жалобы игроков. Пусто — не слать.
            [JsonProperty("ReportsWebhook")] public string ReportsWebhook { get; set; } = "";
            [JsonProperty("NotifyBans")] public bool NotifyBans { get; set; } = true;
            [JsonProperty("NotifyUnbans")] public bool NotifyUnbans { get; set; } = true;
            [JsonProperty("NotifyReports")] public bool NotifyReports { get; set; } = true;
            /// Как подписывать сервер в сообщении. Пусто — берётся hostname сервера.
            [JsonProperty("ServerName")] public string ServerName { get; set; } = "";
            /// С какой по счёту жалобы на игрока к сообщению приписывается @everyone.
            /// 0 — не упоминать вовсе.
            [JsonProperty("MentionEveryoneFrom")] public int MentionEveryoneFrom { get; set; } = 2;
            /// Сколько часов живёт счётчик жалоб на одного игрока. После тишины длиннее
            /// этого срока счёт идёт заново — иначе одна старая жалоба вечно тянула бы
            /// за собой @everyone.
            [JsonProperty("ReportCountWindowHours")] public int ReportCountWindowHours { get; set; } = 24;
            /// Аватарки Steam в сообщении: справа — тот, на кого жалуются, в подписи — жалобщик.
            /// Берутся из публичного XML профиля, ключ Steam API для этого не нужен.
            [JsonProperty("ShowAvatars")] public bool ShowAvatars { get; set; } = true;
        }

        private class PluginConfig
        {
            // Адрес панели. Если она развёрнута не на localhost — поправьте здесь один раз
            // либо передайте адрес первым аргументом: ynazicottv.setup <адрес> <код>.
            [JsonProperty("ApiUrl")] public string ApiUrl { get; set; } = "http://localhost:3000";
            // ServerId/ServerKey/ServerSecret заполняет команда ynazicottv.setup — руками их трогать не нужно.
            [JsonProperty("ServerId")] public string ServerId { get; set; } = "";
            [JsonProperty("ServerKey")] public string ServerKey { get; set; } = "";
            [JsonProperty("ServerSecret")] public string ServerSecret { get; set; } = "";
            [JsonProperty("HeartbeatIntervalSec")] public int HeartbeatIntervalSec { get; set; } = 30;
            [JsonProperty("CommandPollIntervalSec")] public int CommandPollIntervalSec { get; set; } = 10;
            [JsonProperty("AfkThresholdSec")] public int AfkThresholdSec { get; set; } = 300;
            [JsonProperty("TrackChat")] public bool TrackChat { get; set; } = true;
            [JsonProperty("TrackSigns")] public bool TrackSigns { get; set; } = true;
            /// Как часто отправлять координаты живых игроков для карты.
            [JsonProperty("PositionIntervalSec")] public int PositionIntervalSec { get; set; } = 5;
            /// Сторона сетки высот. 512 — разумный баланс детализации и размера запроса.
            [JsonProperty("MapResolution")] public int MapResolution { get; set; } = 512;
            [JsonProperty("AntiCheat")] public AntiCheatConfig AntiCheat { get; set; } = new AntiCheatConfig();
            [JsonProperty("Reports")] public ReportsConfig Reports { get; set; } = new ReportsConfig();
            [JsonProperty("Discord")] public DiscordConfig Discord { get; set; } = new DiscordConfig();
        }

        protected override void LoadDefaultConfig() => _config = new PluginConfig();

        protected override void LoadConfig()
        {
            base.LoadConfig();
            try
            {
                _config = Config.ReadObject<PluginConfig>() ?? new PluginConfig();
                if (_config.AntiCheat == null) _config.AntiCheat = new AntiCheatConfig();
                if (_config.Reports == null) _config.Reports = new ReportsConfig();
                if (_config.Reports.Reasons == null || _config.Reports.Reasons.Count == 0)
                    _config.Reports.Reasons = new ReportsConfig().Reasons;
                else
                    // Конфиги, распухшие до починки Replace, чистим один раз при загрузке.
                    _config.Reports.Reasons = _config.Reports.Reasons
                        .Where(reason => !string.IsNullOrEmpty(reason))
                        .Distinct()
                        .ToList();
                // Секция появилась в 1.4.0 — у старых конфигов её нет, дописываем пустую.
                if (_config.Discord == null) _config.Discord = new DiscordConfig();
            }
            catch
            {
                PrintError("Конфиг повреждён, использую значения по умолчанию.");
                _config = new PluginConfig();
            }
            SaveConfig();
        }

        protected override void SaveConfig() => Config.WriteObject(_config, true);

        #endregion

        #region Состояние

        private const string PermAdmin = "ynazicottv.admin";

        // Константы очереди отправки
        private const int MaxQueueSize = 500;
        private const int MaxAttempts = 5;
        private const float PanelDownWarnSec = 120f;

        // Дебаунс события violation: не чаще одного на игрока+тип в 10 секунд
        private const float ViolationDebounceSec = 10f;

        // Имя CUI-слоя с баннером вызова на проверку
        private const string CheckBannerPanel = "ynazicottv.check.banner";

        // Текст баннера — это оформление, поэтому живёт в плагине: панель только просит
        // его показать и может прислать свой заголовок. Разметку <color=…> Rust понимает.
        private const string BannerHeadline = "ВАС ВЫЗВАЛИ НА ПРОВЕРКУ";
        private static readonly string[] BannerLines =
        {
            "Вы превысили максимально-допустимое количество жалоб!",
            "Предоставьте ваш <color=#5865f2>Discord</color> для того чтобы с вами связалась наша модерация.",
            "В случае <color=#f59e0b>игнорирования</color> данного сообщения - вы получите <color=#ef4444>блокировку</color> на сервере!"
        };
        // Команда та же, что регистрирует сам плагин ниже — [ChatCommand("ds")].
        private const string BannerCommandLine = "Команда для отправки : <color=#22c55e>/ds ваш_дискорд</color>";
        // Пока идут проверки, очередь команд опрашивается чаще — иначе чат панели тормозит
        private const float CheckPollIntervalSec = 2f;
        // Максимальная длина дискорда из /ds — панель всё равно режет по 64
        private const int MaxDiscordLength = 64;

        private const int ChatBatchSize = 20;
        private const float ChatFlushIntervalSec = 15f;
        private const float CombatAggregateIntervalSec = 300f;

        // Убийства и смерти уходят пачками, как чат: в замесе их бывает
        // несколько в секунду, и на каждое отдельным запросом панель
        // ответила бы 429 — вместе с ним потерялись бы и heartbeat.
        private const int CombatLogBatchSize = 40;
        private const float CombatLogFlushIntervalSec = 15f;

        private readonly Dictionary<ulong, float> _lastInput = new Dictionary<ulong, float>();
        private readonly Dictionary<ulong, ConnectionInfo> _connections = new Dictionary<ulong, ConnectionInfo>();
        private readonly Dictionary<ulong, CombatStats> _combat = new Dictionary<ulong, CombatStats>();
        private readonly Dictionary<string, ViolationCounter> _violations = new Dictionary<string, ViolationCounter>();
        private readonly Dictionary<ulong, ShotWindow> _shotWindows = new Dictionary<ulong, ShotWindow>();
        private readonly List<object> _chatBuffer = new List<object>();
        private readonly List<object> _combatLogBuffer = new List<object>();

        // Игроки, по которым панель ведёт проверку: их сообщения уходят без задержки,
        // а очередь команд опрашивается чаще. Заполняется командами check/check_banner.
        private readonly HashSet<ulong> _checked = new HashSet<ulong>();
        // На чьих экранах сейчас висит баннер — чтобы снять его при выгрузке плагина.
        private readonly HashSet<ulong> _banners = new HashSet<ulong>();
        // Текущий интервал опроса команд, чтобы не пересоздавать таймер на каждой команде.
        private float _commandPollInterval;

        private readonly LinkedList<PendingRequest> _queue = new LinkedList<PendingRequest>();
        private bool _sending;
        private float _sendingStartedAt;
        private int _droppedSinceWarn;
        private DateTime _lastSuccessAt = DateTime.UtcNow;
        private bool _panelDownReported;

        // Oxide.Plugins.Timer (обёртка из PluginTimers), не Oxide.Core.Libraries.Timer —
        // именно её возвращает timer.Every(), у неё нет вложенного TimerInstance.
        private Timer _heartbeatTimer;
        private Timer _commandTimer;
        private Timer _queueTimer;
        private Timer _chatTimer;
        private Timer _combatTimer;
        private Timer _combatLogTimer;
        private Timer _positionTimer;
        private Timer _mapScanTimer;

        private bool _mapScanRunning;

        private class ConnectionInfo
        {
            public ulong OwnerId;
            public string Ip;
            public int AuthLevel;
            public bool Licensed;
            public bool FamilyShare;
            public DateTime ConnectedAt;
        }

        private class CombatStats
        {
            public int Shots;
            public int Hits;
            public int Headshots;
            public int Kills;
            public float TotalKillDistance;
            public float MaxKillDistance;
            public DateTime WindowStart = DateTime.UtcNow;

            public void Reset()
            {
                Shots = Hits = Headshots = Kills = 0;
                TotalKillDistance = 0f;
                MaxKillDistance = 0f;
                WindowStart = DateTime.UtcNow;
            }
        }

        private class ViolationCounter
        {
            public float LastSentAt;
            public int Count;
            public float MaxAmount;
        }

        private class ShotWindow
        {
            public float WindowStart;
            public int Shots;
            public float LastReportedAt;
        }

        private class PendingRequest
        {
            public string Path;
            public string Body;
            public RequestMethod Method;
            public int Attempts;
            public float NextAttemptAt;
            public Action<int, string> OnSuccess;
        }

        #endregion

        #region Жизненный цикл

        private void Init()
        {
            permission.RegisterPermission(PermAdmin, this);

            // Имя команды настраивается: на сервере уже может жить чужой /report.
            var reportCommand = (_config.Reports.Command ?? "").Trim().TrimStart('/');
            if (string.IsNullOrEmpty(reportCommand)) reportCommand = "report";
            cmd.AddChatCommand(reportCommand, this, nameof(CmdReport));
        }

        /// Плагин настроен, если панель выдала ключи — обычно через ynazicottv.setup.
        private bool IsConfigured =>
            !string.IsNullOrEmpty(_config.ApiUrl) &&
            !string.IsNullOrEmpty(_config.ServerId) &&
            !string.IsNullOrEmpty(_config.ServerKey) &&
            !string.IsNullOrEmpty(_config.ServerSecret);

        private void OnServerInitialized()
        {
            foreach (var player in BasePlayer.activePlayerList)
            {
                _lastInput[player.userID] = Time.realtimeSinceStartup;
                CacheConnection(player);
            }

            if (!IsConfigured)
            {
                PrintWarning(
                    "Сервер ещё не подключён к панели.\n" +
                    "Откройте панель -> Главная -> Подключить сервер, скопируйте команду и выполните её здесь.\n" +
                    "Формат: ynazicottv.setup <код>");
                return;
            }

            StartTimers();
            SendHeartbeat();
        }

        private void StartTimers()
        {
            StopTimers();

            _queueTimer = timer.Every(1f, ProcessQueue);
            _heartbeatTimer = timer.Every(Math.Max(5, _config.HeartbeatIntervalSec), SendHeartbeat);

            _commandPollInterval = 0f;
            UpdateCommandPollRate();

            if (_config.TrackChat)
                _chatTimer = timer.Every(ChatFlushIntervalSec, FlushChat);

            if (_config.AntiCheat.Enabled)
                _combatTimer = timer.Every(CombatAggregateIntervalSec, AggregateCombat);

            _combatLogTimer = timer.Every(CombatLogFlushIntervalSec, FlushCombatLog);

            _positionTimer = timer.Every(Math.Max(2, _config.PositionIntervalSec), SendPositions);

            // Рельеф снимаем один раз за вайп, поэтому сначала спрашиваем панель, нужен ли он ей.
            CheckMapUpload();
        }

        private void StopTimers()
        {
            _heartbeatTimer?.Destroy();
            _commandTimer?.Destroy();
            _queueTimer?.Destroy();
            _chatTimer?.Destroy();
            _combatTimer?.Destroy();
            _combatLogTimer?.Destroy();
            _positionTimer?.Destroy();
            _mapScanTimer?.Destroy();

            _heartbeatTimer = _commandTimer = _queueTimer = _chatTimer = _combatTimer = null;
            _positionTimer = _mapScanTimer = _combatLogTimer = null;
            _mapScanRunning = false;
        }

        private void Unload()
        {
            StopTimers();
            HideAllCheckBanners();
            CloseAllReportUi();

            if (!IsConfigured) return;

            FlushChat();
            FlushCombatLog();

            // Финальный снапшот с пустым списком — панель сразу пометит игроков оффлайн.
            var body = new Dictionary<string, object>
            {
                ["serverId"] = _config.ServerId,
                ["serverName"] = ConVar.Server.hostname,
                ["timestamp"] = Now(),
                ["hostname"] = ConVar.Server.hostname,
                ["maxPlayers"] = ConVar.Server.maxplayers,
                ["uptimeSec"] = (int)Time.realtimeSinceStartup,
                ["queuedPlayers"] = 0,
                ["joiningPlayers"] = 0,
                ["seed"] = World.Seed,
                ["worldSize"] = World.Size,
                ["players"] = new List<object>()
            };

            // Отправляем напрямую: очередь вместе с плагином уже выгружается.
            SendNow("/api/ingest/heartbeat", JsonConvert.SerializeObject(body), RequestMethod.POST, null);
        }

        private void OnServerSave()
        {
            // Момент, когда сервер и так «замирает» — удобно слить буферы.
            FlushChat();
            FlushCombatLog();
        }

        #endregion

        #region Подключение и IP

        private object CanClientLogin(Network.Connection connection)
        {
            if (connection == null) return null;

            var ip = StripPort(connection.ipaddress);
            var licensed = IsLicensedSteamId(connection.userid);

            _connections[connection.userid] = new ConnectionInfo
            {
                OwnerId = connection.ownerid,
                Ip = ip,
                AuthLevel = (int)connection.authLevel,
                Licensed = licensed,
                FamilyShare = connection.ownerid != 0UL && connection.ownerid != connection.userid,
                ConnectedAt = DateTime.UtcNow
            };

            // Ничего не блокируем.
            return null;
        }

        private void OnPlayerConnected(BasePlayer player)
        {
            if (player == null) return;

            _lastInput[player.userID] = Time.realtimeSinceStartup;
            CacheConnection(player);

            var info = GetConnection(player);

            SendEvent("player_connected", new Dictionary<string, object>
            {
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["ip"] = info.Ip,
                ["ping"] = GetPing(player),
                ["ownerSteamId"] = info.OwnerId == 0UL ? player.UserIDString : info.OwnerId.ToString(),
                ["familyShare"] = info.FamilyShare,
                ["licensed"] = info.Licensed,
                ["authLevel"] = info.AuthLevel
            });
        }

        private void OnPlayerDisconnected(BasePlayer player, string reason)
        {
            if (player == null) return;

            var info = GetConnection(player);
            var durationSec = (int)(DateTime.UtcNow - info.ConnectedAt).TotalSeconds;

            SendEvent("player_disconnected", new Dictionary<string, object>
            {
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["reason"] = reason ?? "",
                ["durationSec"] = durationSec
            });

            _lastInput.Remove(player.userID);
            _connections.Remove(player.userID);
            _combat.Remove(player.userID);
            _shotWindows.Remove(player.userID);
            // UI умирает вместе с сессией; проверку панель закроет сама командой check_end.
            _banners.Remove(player.userID);
            _reportUi.Remove(player.userID);

            // Ключ _violations — "userID:type", чистим все типы разом, иначе словарь растёт вечно.
            var prefix = player.userID + ":";
            foreach (var key in _violations.Keys.Where(k => k.StartsWith(prefix, StringComparison.Ordinal)).ToList())
                _violations.Remove(key);
        }

        #endregion

        #region Состояние и AFK

        private void OnPlayerSleep(BasePlayer player)
        {
            // Состояние сна читается напрямую в heartbeat, здесь только сбрасываем ввод.
            if (player != null) _lastInput[player.userID] = Time.realtimeSinceStartup;
        }

        private void OnPlayerSleepEnded(BasePlayer player)
        {
            if (player != null) _lastInput[player.userID] = Time.realtimeSinceStartup;
        }

        // Горячий хук: только присвоение в словарь, никаких аллокаций и отправок.
        private void OnPlayerInput(BasePlayer player, InputState input)
        {
            if (player == null) return;
            _lastInput[player.userID] = Time.realtimeSinceStartup;
        }

        private bool IsAfk(BasePlayer player)
        {
            if (player.IsSleeping()) return false;
            float last;
            if (!_lastInput.TryGetValue(player.userID, out last)) return false;
            return Time.realtimeSinceStartup - last > _config.AfkThresholdSec;
        }

        #endregion

        #region Чат и команды

        private void OnPlayerChat(BasePlayer player, string message, ConVar.Chat.ChatChannel channel)
        {
            if (!_config.TrackChat || player == null || string.IsNullOrEmpty(message)) return;

            _chatBuffer.Add(new Dictionary<string, object>
            {
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["channel"] = channel.ToString(),
                ["message"] = message,
                ["timestamp"] = Now()
            });

            // Сообщение проверяемого нужно панели сразу — это её приватный чат с игроком.
            if (_checked.Contains(player.userID)) FlushChatNow();
            else if (_chatBuffer.Count >= ChatBatchSize) FlushChat();
        }

        private void OnPlayerCommand(BasePlayer player, string command, string[] args)
        {
            if (!_config.TrackChat || player == null) return;

            _chatBuffer.Add(new Dictionary<string, object>
            {
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["channel"] = "Command",
                ["message"] = "/" + command + (args != null && args.Length > 0 ? " " + string.Join(" ", args) : ""),
                ["timestamp"] = Now()
            });

            if (_checked.Contains(player.userID)) FlushChatNow();
            else if (_chatBuffer.Count >= ChatBatchSize) FlushChat();
        }

        /// Слив чата без ожидания тика очереди: ProcessQueue вызывается раз в секунду,
        /// и для приватного чата проверки эта секунда заметна. Ретраи при этом сохраняются —
        /// запрос всё равно проходит через обычную очередь.
        private void FlushChatNow()
        {
            if (_chatBuffer.Count == 0) return;

            FlushChat();
            ProcessQueue();
        }

        private void FlushChat()
        {
            if (_chatBuffer.Count == 0) return;

            var messages = new List<object>(_chatBuffer);
            _chatBuffer.Clear();

            SendEvent("chat_message", new Dictionary<string, object>
            {
                ["count"] = messages.Count,
                ["messages"] = messages
            });
        }

        /// Одним запросом отдаёт накопленные убийства и смерти — панель разложит их обратно.
        private void FlushCombatLog()
        {
            if (_combatLogBuffer.Count == 0) return;

            var entries = new List<object>(_combatLogBuffer);
            _combatLogBuffer.Clear();

            SendEvent("combat_log", new Dictionary<string, object>
            {
                ["count"] = entries.Count,
                ["entries"] = entries
            });
        }

        #endregion

        #region Репорты и баны

        private void OnPlayerReported(BasePlayer reporter, string targetName, string targetId,
            string subject, string message, string type)
        {
            if (reporter == null) return;

            SendReportEvent(reporter, targetId, targetName, subject, message, type);
        }

        /// Точка входа для сторонних плагинов: чужое меню репортов должно вести туда же,
        /// куда ведут F7 и /report. Прямой вызов SendEvent("player_reported") в обход
        /// этого метода кладёт жалобу только в панель — в Discord не уходит ничего,
        /// и молча: вся диагностика вебхука живёт дальше по пути.
        [HookMethod("SendPlayerReport")]
        public bool SendPlayerReport(BasePlayer reporter, string targetId, string targetName,
            string subject, string message, string type)
        {
            if (reporter == null) return false;

            SendReportEvent(reporter, targetId, targetName, subject, message, type);
            return true;
        }

        /// Репорт уходит двумя путями сразу: в панель (там он ложится в таблицу)
        /// и в Discord, если вебхук указан в конфиге. Через одну точку — чтобы
        /// нативный F7-репорт и меню /report вели себя одинаково.
        private void SendReportEvent(BasePlayer reporter, string targetId, string targetName,
            string subject, string message, string type)
        {
            SendEvent("player_reported", new Dictionary<string, object>
            {
                ["steamId"] = reporter.UserIDString,
                ["reporterSteamId"] = reporter.UserIDString,
                ["reporterName"] = reporter.displayName,
                ["targetSteamId"] = targetId ?? "",
                ["targetName"] = targetName ?? "",
                ["subject"] = subject ?? "",
                ["message"] = message ?? "",
                ["type"] = type ?? ""
            });

            if (!_config.Discord.NotifyReports) return;

            // Данные жалобщика снимаем сейчас: сообщение уходит после запросов за аватарками,
            // а к тому моменту игрок может уже отключиться — BasePlayer станет пустым.
            var reporterId = reporter.UserIDString;
            var reporterName = reporter.displayName;

            var count = BumpReportTally(targetId);
            var shownName = string.IsNullOrEmpty(targetName) ? (targetId ?? "—") : targetName;

            // На кого жалуются — ссылкой на профиль Steam; без валидного ID ссылки нет.
            var target = IsSteamId(targetId)
                ? "[" + EscapeMarkdown(Trim(shownName, 64)) + "](https://steamcommunity.com/profiles/" + targetId + ")"
                : "**" + EscapeMarkdown(Trim(shownName, 64)) + "**";

            var fields = new List<object>
            {
                DiscordField("SteamID", targetId, true),
                DiscordField("Причина", string.IsNullOrEmpty(subject) ? type : subject, true)
            };

            if (!string.IsNullOrEmpty(message)) fields.Add(DiscordField("Комментарий", message, false));

            var footer = "От: " + reporterName + " [" + reporterId + "] • " + DiscordServerName();

            // Порог из конфига: первая жалоба уходит тихо, вторая и дальше — с @everyone.
            var mentionFrom = _config.Discord.MentionEveryoneFrom;
            var content = mentionFrom > 0 && count >= mentionFrom ? "@everyone" : null;

            var webhook = _config.Discord.ReportsWebhook;

            // Аватарки едут отдельными запросами в Steam, поэтому сообщение собирается
            // во вложенных колбэках: сначала тот, на кого жалуются (картинка справа),
            // затем жалобщик (кружок в подписи). Не ответил Steam — останемся без картинки.
            FetchSteamAvatar(targetId, targetAvatar =>
                FetchSteamAvatar(reporterId, reporterAvatar =>
                {
                    var embed = new Dictionary<string, object>
                    {
                        ["description"] = ReportCountPhrase(count) + " на " + target,
                        ["color"] = ColorReport,
                        ["fields"] = fields,
                        ["timestamp"] = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture)
                    };

                    if (!string.IsNullOrEmpty(targetAvatar))
                        embed["thumbnail"] = new Dictionary<string, object> { ["url"] = targetAvatar };

                    var signature = new Dictionary<string, object> { ["text"] = Trim(footer, 2048) };
                    if (!string.IsNullOrEmpty(reporterAvatar)) signature["icon_url"] = reporterAvatar;
                    embed["footer"] = signature;

                    PostToDiscord(webhook, embed, content);
                }));
        }

        /// «Получена 1 жалоба» / «Получено 3 жалобы» / «Получено 5 жалоб» — русский счёт
        /// с оглядкой на десятки: 11-14 всегда «жалоб», сколько бы ни было единиц.
        private static string ReportCountPhrase(int count)
        {
            var tens = count % 100;
            var units = count % 10;

            if (tens < 11 || tens > 14)
            {
                if (units == 1) return "Получена **" + count + "** жалоба";
                if (units >= 2 && units <= 4) return "Получено **" + count + "** жалобы";
            }

            return "Получено **" + count + "** жалоб";
        }

        private void OnUserBanned(string name, string id, string ipAddress, string reason)
        {
            SendEvent("player_banned", new Dictionary<string, object>
            {
                ["steamId"] = id ?? "",
                ["name"] = name ?? "",
                ["ip"] = StripPort(ipAddress),
                ["reason"] = reason ?? ""
            });

            // Игрока разобрали — счёт жалоб на него начинается заново.
            if (!string.IsNullOrEmpty(id)) _reportTally.Remove(id);

            if (!_config.Discord.NotifyBans) return;

            // Логин модератора приезжает вместе с командой из панели; бан из консоли
            // сервера или от чужого плагина автора не несёт — там подписывать нечем.
            string admin;
            TakePanelAction("ban", id, out admin);

            SendPunishmentToDiscord(ColorBan, "Выдал блокировку игроку", admin, id, name, new List<object>
            {
                DiscordField("Причина", reason, true),
                // Rust банит навсегда: `banid` срока не принимает, снимает бан только разбан.
                DiscordField("Дата разбана", "никогда", true)
            });
        }

        private void OnUserUnbanned(string name, string id, string ipAddress)
        {
            SendEvent("player_unbanned", new Dictionary<string, object>
            {
                ["steamId"] = id ?? "",
                ["name"] = name ?? "",
                ["ip"] = StripPort(ipAddress)
            });

            if (!_config.Discord.NotifyUnbans) return;

            string admin;
            TakePanelAction("unban", id, out admin);

            SendPunishmentToDiscord(ColorUnban, "Снял блокировку с игрока", admin, id, name, null);
        }

        /// Общая раскладка сообщений о блокировке: сверху — кто выдал, в описании —
        /// с кем это сделали, справа — его аватарка из Steam. Поля у бана и разбана
        /// разные, поэтому приходят готовыми; null — сообщение без полей.
        private void SendPunishmentToDiscord(int color, string action, string admin, string steamId,
            string name, List<object> fields)
        {
            var shownName = string.IsNullOrEmpty(name) ? (steamId ?? "—") : name;

            var target = IsSteamId(steamId)
                ? "[" + EscapeMarkdown(Trim(shownName, 64)) + "](https://steamcommunity.com/profiles/" + steamId + ")"
                : "**" + EscapeMarkdown(Trim(shownName, 64)) + "**";

            var description = action + " " + target
                              + " (" + (string.IsNullOrEmpty(steamId) ? "—" : steamId) + ")";

            var author = string.IsNullOrEmpty(admin) ? "Консоль сервера" : admin;
            var webhook = _config.Discord.BansWebhook;

            FetchSteamAvatar(steamId, avatar =>
            {
                var embed = new Dictionary<string, object>
                {
                    ["author"] = new Dictionary<string, object> { ["name"] = Trim(author, 256) },
                    ["description"] = description,
                    ["color"] = color,
                    ["footer"] = new Dictionary<string, object> { ["text"] = Trim(DiscordServerName(), 2048) },
                    ["timestamp"] = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture)
                };

                if (fields != null && fields.Count > 0) embed["fields"] = fields;

                if (!string.IsNullOrEmpty(avatar))
                    embed["thumbnail"] = new Dictionary<string, object> { ["url"] = avatar };

                PostToDiscord(webhook, embed, null);
            });
        }

        #endregion

        #region Меню репортов

        // Раскладка и палитра сняты с меню репортов QuickPanel: сетка 6x3 из карточек 116x116
        // с отступом 8, шапка и поиск над ней, стрелки страниц под ней. Размеры заданы
        // в пикселях, а не в долях экрана, потому что канвас Rust всегда масштабируется
        // к одному разрешению — так меню выглядит одинаково и на 1080p, и на ультравайде.
        private const string ReportPanel = "ynazicottv.report";
        private const string ReportRoot = "ynazicottv.report.grid";
        private const string ReportHead = "ynazicottv.report.head";
        private const string ReportSearch = "ynazicottv.report.search";
        private const string ReportPopup = "ynazicottv.report.popup";
        private const string ReportMessage = "ynazicottv.report.msg";

        private const int ReportColumns = 6;
        private const int ReportRows = 3;
        private const int ReportPerPage = ReportColumns * ReportRows;
        private const int CardSize = 116;
        private const int CardMargin = 8;
        private const int CardPitch = CardSize + CardMargin;
        private const int GridWidth = ReportColumns * CardSize + (ReportColumns - 1) * CardMargin;
        private const int GridHeight = ReportRows * CardSize + (ReportRows - 1) * CardMargin;

        // Бежевый акцент и его прозрачные оттенки — вся палитра меню.
        private const string Accent = "0.816 0.776 0.741";
        private const string AccentDim = "0.816 0.776 0.741 0.5";
        private const string AccentFaint = "0.816 0.776 0.741 0.3";
        private const string PanelBg = "0.816 0.776 0.741 0.2";

        // Длинные ники в карточку не влезают — обрезаем так же, как на макете.
        private const int MaxNameChars = 16;
        private const int MaxReportMessage = 128;

        private const string FontRegular = "robotocondensed-regular.ttf";
        private const string FontBold = "robotocondensed-bold.ttf";

        private class ReportTarget
        {
            public ulong UserId;
            public string SteamId;
            public string Name;
        }

        private class ReportUiState
        {
            public int Page;
            public string Query = "";
            /// null — открыт список игроков, иначе поверх него окно выбора причины.
            public ReportTarget Target;
            /// Ячейка сетки, из которой раскрылось окно причин.
            public int Slot;
            public int Reason;
            public string Message = "";
        }

        private readonly Dictionary<ulong, ReportUiState> _reportUi = new Dictionary<ulong, ReportUiState>();
        // Ключ "жалобщик:цель" -> когда ушёл последний репорт. Живёт до перезагрузки плагина.
        private readonly Dictionary<string, DateTime> _reportSentAt = new Dictionary<string, DateTime>();

        #region Открытие и команды меню

        /// Чат-команда из конфига (по умолчанию /report). Аргумент — сразу поиск: /report Вася.
        private void CmdReport(BasePlayer player, string command, string[] args)
        {
            if (player == null) return;

            if (!_config.Reports.Enabled)
            {
                SendReply(player, "Репорты на этом сервере отключены.");
                return;
            }

            var state = GetReportState(player);
            state.Target = null;
            state.Page = 0;
            state.Message = "";
            state.Query = args != null && args.Length > 0 ? string.Join(" ", args).Trim() : "";

            DrawReportUi(player);
        }

        [ConsoleCommand("ynazicottv.report.page")]
        private void CmdReportPage(ConsoleSystem.Arg arg)
        {
            var player = arg.Player();
            ReportUiState state;
            if (player == null || !_reportUi.TryGetValue(player.userID, out state)) return;

            int page;
            if (!int.TryParse(arg.GetString(0) ?? "", out page)) page = 0;

            state.Page = Math.Max(0, page);
            state.Target = null;
            DrawReportUi(player);
        }

        /// Текст приходит от поля ввода при нажатии Enter или при потере фокуса.
        [ConsoleCommand("ynazicottv.report.search")]
        private void CmdReportSearch(ConsoleSystem.Arg arg)
        {
            var player = arg.Player();
            ReportUiState state;
            if (player == null || !_reportUi.TryGetValue(player.userID, out state)) return;

            var query = JoinArgs(arg);
            if (query.Length > 32) query = query.Substring(0, 32);

            // Тот же запрос — не перерисовываем: поле ввода теряет фокус на каждой отрисовке.
            if (query == state.Query && state.Target == null) return;

            state.Query = query;
            state.Page = 0;
            state.Target = null;
            DrawReportUi(player);
        }

        [ConsoleCommand("ynazicottv.report.select")]
        private void CmdReportSelect(ConsoleSystem.Arg arg)
        {
            var player = arg.Player();
            ReportUiState state;
            if (player == null || !_reportUi.TryGetValue(player.userID, out state)) return;

            var steamId = (arg.GetString(0) ?? "").Trim();
            if (!IsSteamId(steamId)) return;

            var remaining = ReportCooldownLeft(player.UserIDString, steamId);
            if (remaining > 0)
            {
                CloseReportUi(player);
                SendReply(player, "<color=#ef4444>Репорт</color> на этого игрока можно отправить снова через "
                                  + FormatDuration(remaining) + ".");
                return;
            }

            // Второй аргумент — номер карточки: из неё раскроется окно с причинами.
            int slot;
            if (!int.TryParse(arg.GetString(1) ?? "", out slot)) slot = 0;

            state.Target = new ReportTarget
            {
                UserId = ulong.Parse(steamId),
                SteamId = steamId,
                Name = FindPlayerName(steamId)
            };
            state.Slot = Math.Max(0, Math.Min(slot, ReportPerPage - 1));
            state.Reason = 0;
            state.Message = "";

            DrawReportUi(player);
        }

        /// Причина и есть кнопка отправки: выбрал — репорт ушёл.
        [ConsoleCommand("ynazicottv.report.reason")]
        private void CmdReportReason(ConsoleSystem.Arg arg)
        {
            var player = arg.Player();
            ReportUiState state;
            if (player == null || !_reportUi.TryGetValue(player.userID, out state)) return;
            if (state.Target == null) return;

            int index;
            if (!int.TryParse(arg.GetString(0) ?? "", out index)) return;
            if (index < 0 || index >= _config.Reports.Reasons.Count) return;

            state.Reason = index;
            SubmitReport(player, state);
        }

        [ConsoleCommand("ynazicottv.report.message")]
        private void CmdReportMessage(ConsoleSystem.Arg arg)
        {
            var player = arg.Player();
            ReportUiState state;
            if (player == null || !_reportUi.TryGetValue(player.userID, out state)) return;
            if (state.Target == null) return;

            var message = JoinArgs(arg);
            if (message.Length > MaxReportMessage) message = message.Substring(0, MaxReportMessage);

            if (message == state.Message) return;

            state.Message = message;
            DrawReportUi(player);
        }

        [ConsoleCommand("ynazicottv.report.back")]
        private void CmdReportBack(ConsoleSystem.Arg arg)
        {
            var player = arg.Player();
            ReportUiState state;
            if (player == null || !_reportUi.TryGetValue(player.userID, out state)) return;

            state.Target = null;
            state.Message = "";
            DrawReportUi(player);
        }

        [ConsoleCommand("ynazicottv.report.close")]
        private void CmdReportClose(ConsoleSystem.Arg arg)
        {
            var player = arg.Player();
            if (player != null) CloseReportUi(player);
        }

        private ReportUiState GetReportState(BasePlayer player)
        {
            ReportUiState state;
            if (_reportUi.TryGetValue(player.userID, out state)) return state;

            state = new ReportUiState();
            _reportUi[player.userID] = state;
            return state;
        }

        private void CloseReportUi(BasePlayer player)
        {
            CuiHelper.DestroyUi(player, ReportPanel);
            _reportUi.Remove(player.userID);
        }

        private void CloseAllReportUi()
        {
            foreach (var userId in _reportUi.Keys.ToList())
            {
                var player = BasePlayer.FindByID(userId);
                if (player != null && player.IsConnected) CuiHelper.DestroyUi(player, ReportPanel);
            }

            _reportUi.Clear();
        }

        #endregion

        #region Отправка репорта

        private void SubmitReport(BasePlayer reporter, ReportUiState state)
        {
            var target = state.Target;
            if (target == null || !IsSteamId(target.SteamId))
            {
                CloseReportUi(reporter);
                return;
            }

            var remaining = ReportCooldownLeft(reporter.UserIDString, target.SteamId);
            if (remaining > 0)
            {
                CloseReportUi(reporter);
                SendReply(reporter, "<color=#ef4444>Репорт</color> на этого игрока можно отправить снова через "
                                    + FormatDuration(remaining) + ".");
                return;
            }

            var reason = ReasonAt(state.Reason);
            var targetName = string.IsNullOrEmpty(target.Name) ? target.SteamId : target.Name;

            _reportSentAt[reporter.UserIDString + ":" + target.SteamId] = DateTime.UtcNow;
            PruneReportCooldowns();

            // Тот же формат, что у нативного F7-репорта, — панель кладёт оба в одну таблицу.
            SendReportEvent(reporter, target.SteamId, target.Name ?? "", reason, state.Message ?? "", reason);

            CloseReportUi(reporter);
            SendReply(reporter, "<color=#22c55e>Репорт отправлен</color> на " + Sanitize(targetName)
                                + " (" + reason + "). Модерация разберётся.");
        }

        /// Сколько секунд осталось до следующего репорта на этого же игрока. 0 — можно отправлять.
        private int ReportCooldownLeft(string reporterId, string targetId)
        {
            var cooldown = Math.Max(0, _config.Reports.CooldownSec);
            if (cooldown == 0) return 0;

            DateTime sentAt;
            if (!_reportSentAt.TryGetValue(reporterId + ":" + targetId, out sentAt)) return 0;

            var passed = (int)(DateTime.UtcNow - sentAt).TotalSeconds;
            return passed >= cooldown ? 0 : cooldown - passed;
        }

        /// Словарь пауз растёт с каждым репортом, поэтому просроченные записи выкидываем.
        private void PruneReportCooldowns()
        {
            if (_reportSentAt.Count < 256) return;

            var cooldown = Math.Max(1, _config.Reports.CooldownSec);
            var now = DateTime.UtcNow;

            foreach (var pair in _reportSentAt.ToList())
            {
                if ((now - pair.Value).TotalSeconds >= cooldown) _reportSentAt.Remove(pair.Key);
            }
        }

        private string ReasonAt(int index)
        {
            var reasons = _config.Reports.Reasons;
            if (reasons == null || reasons.Count == 0) return "Other";
            return reasons[Math.Max(0, Math.Min(index, reasons.Count - 1))];
        }

        #endregion

        #region Отрисовка меню

        private void DrawReportUi(BasePlayer player)
        {
            var state = GetReportState(player);

            CuiHelper.DestroyUi(player, ReportPanel);

            var container = new CuiElementContainer();

            // Блюр с затемнением, поверх — серый радиальный градиент: он и есть фон меню.
            container.Add(new CuiPanel
            {
                Image = { Color = "0 0 0 0.8", Material = "assets/content/ui/uibackgroundblur-ingamemenu.mat" },
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "0 0", OffsetMax = "0 0" },
                CursorEnabled = true,
                KeyboardEnabled = true
            }, "Overlay", ReportPanel);

            // Esc до CUI не доходит, поэтому клик мимо окна закрывает меню — иначе из него не выйти.
            container.Add(new CuiButton
            {
                Button =
                {
                    Color = "0.20 0.20 0.20 1.00",
                    Sprite = "assets/content/ui/ui.background.transparent.radial.psd",
                    Command = "ynazicottv.report.close"
                },
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "0 0", OffsetMax = "0 0" },
                Text = { Text = "" }
            }, ReportPanel, ReportPanel + ".backdrop");

            // Сетка карточек — она же центральный контейнер: шапка и поиск висят
            // на её верхних якорях, стрелки страниц — на нижнем правом.
            container.Add(new CuiPanel
            {
                Image = { Color = "0 0 0 0" },
                RectTransform =
                {
                    AnchorMin = "0.5 0.5", AnchorMax = "0.5 0.5",
                    OffsetMin = Px(-GridWidth / 2, -GridHeight / 2),
                    OffsetMax = Px(GridWidth / 2, GridHeight / 2)
                }
            }, ReportPanel, ReportRoot);

            DrawPlayerList(container, state);

            // Причины раскрываются прямо из карточки, поэтому список остаётся на месте.
            if (state.Target != null) DrawReasonPopup(container, state);

            CuiHelper.AddUi(player, container);
        }

        private void DrawPlayerList(CuiElementContainer container, ReportUiState state)
        {
            var targets = FindReportTargets(state.Query);
            var pages = Math.Max(1, (targets.Count + ReportPerPage - 1) / ReportPerPage);
            if (state.Page >= pages) state.Page = pages - 1;

            DrawHeader(container, state, targets.Count);
            DrawSearch(container, state);
            DrawPager(container, state.Page, pages);

            // Пустые ячейки рисуем тоже: сетка всегда одного размера, как на макете.
            for (var i = 0; i < ReportPerPage; i++)
            {
                var index = state.Page * ReportPerPage + i;
                AddPlayerCard(container, i, index < targets.Count ? targets[index] : null);
            }
        }

        /// Заголовок с подписью над сеткой, по её левому краю.
        private void DrawHeader(CuiElementContainer container, ReportUiState state, int found)
        {
            var hasQuery = !string.IsNullOrEmpty(state.Query);

            container.Add(new CuiPanel
            {
                Image = { Color = "0 0 0 0" },
                RectTransform =
                {
                    AnchorMin = "0 1", AnchorMax = "0.5 1",
                    OffsetMin = Px(0, 7), OffsetMax = Px(0, 47)
                }
            }, ReportRoot, ReportHead);

            var title = hasQuery
                ? "FIND PLAYER - " + Trim(Sanitize(state.Query), 20).ToUpper()
                : "FIND PLAYER";

            AddText(container, ReportHead, ".title", title, 24, Accent,
                Fill(), TextAnchor.UpperLeft, FontBold);

            var subtitle = !hasQuery
                ? "Who do you want to report?"
                : found == 0 ? "No players was found" : "Here are players, which we found";

            AddText(container, ReportHead, ".subtitle", subtitle, 14, AccentFaint,
                Fill(), TextAnchor.LowerLeft, FontRegular);
        }

        /// Поиск в правом верхнем углу. Подсказка — отдельный лейбл под полем:
        /// своего placeholder у CUI нет.
        private void DrawSearch(CuiElementContainer container, ReportUiState state)
        {
            container.Add(new CuiPanel
            {
                Image = { Color = PanelBg },
                RectTransform =
                {
                    AnchorMin = "1 1", AnchorMax = "1 1",
                    OffsetMin = Px(-250, 8), OffsetMax = Px(0, 43)
                }
            }, ReportRoot, ReportSearch);

            if (string.IsNullOrEmpty(state.Query))
            {
                AddText(container, ReportSearch, ".hint", "Enter nickname/steamid", 14, AccentDim,
                    Rect("0 0", "1 1", 10, 0, -85, 0), TextAnchor.MiddleLeft, FontRegular);
            }

            container.Add(new CuiElement
            {
                Name = ReportSearch + ".input",
                Parent = ReportSearch,
                Components =
                {
                    new CuiInputFieldComponent
                    {
                        Text = state.Query ?? "",
                        FontSize = 14,
                        Font = FontRegular,
                        Align = TextAnchor.MiddleLeft,
                        Color = Accent,
                        CharsLimit = 32,
                        Command = "ynazicottv.report.search"
                    },
                    Rect("0 0", "1 1", 10, 0, -85, 0)
                }
            });

            // Кнопка просто перерисовывает список: сам текст поле отдаёт при потере фокуса.
            container.Add(new CuiButton
            {
                Button =
                {
                    Color = Accent,
                    Material = "assets/icons/greyout.mat",
                    Command = "ynazicottv.report.page 0"
                },
                RectTransform =
                {
                    AnchorMin = "1 0", AnchorMax = "1 1",
                    OffsetMin = Px(-75, 0), OffsetMax = Px(0, 0)
                },
                Text = { Text = "Search", FontSize = 14, Align = TextAnchor.MiddleCenter, Color = "0.267 0.247 0.231" }
            }, ReportSearch, ReportSearch + ".btn");
        }

        /// Счётчик страниц и две стрелки под сеткой справа.
        private void DrawPager(CuiElementContainer container, int page, int pages)
        {
            var hasPrev = page > 0;
            var hasNext = page < pages - 1;

            AddText(container, ReportRoot, ".pages", (page + 1) + " / " + pages, 14, AccentDim,
                Rect("1 0", "1 0", -200, -44, -92, -8), TextAnchor.MiddleRight, FontRegular);

            container.Add(new CuiButton
            {
                Button =
                {
                    Color = hasPrev ? AccentFaint : PanelBg,
                    Command = "ynazicottv.report.page " + Math.Max(0, page - 1)
                },
                RectTransform =
                {
                    AnchorMin = "1 0", AnchorMax = "1 0",
                    OffsetMin = Px(-80, -44), OffsetMax = Px(-44, -8)
                },
                Text =
                {
                    Text = "←", FontSize = 24, Align = TextAnchor.MiddleCenter,
                    Color = hasPrev ? Accent : AccentFaint
                }
            }, ReportRoot, ReportRoot + ".prev");

            container.Add(new CuiButton
            {
                Button =
                {
                    Color = hasNext ? AccentFaint : PanelBg,
                    Command = "ynazicottv.report.page " + Math.Min(pages - 1, page + 1)
                },
                RectTransform =
                {
                    AnchorMin = "1 0", AnchorMax = "1 0",
                    OffsetMin = Px(-36, -44), OffsetMax = Px(0, -8)
                },
                Text =
                {
                    Text = "→", FontSize = 24, Align = TextAnchor.MiddleCenter,
                    Color = hasNext ? Accent : AccentFaint
                }
            }, ReportRoot, ReportRoot + ".next");
        }

        /// Карточка игрока: аватарка во весь фон, снизу градиент с ником и SteamID.
        /// target == null — пустая ячейка сетки.
        private void AddPlayerCard(CuiElementContainer container, int slot, ReportTarget target)
        {
            string min, max;
            CardBox(slot, out min, out max);

            var card = ReportRoot + ".card" + slot;

            container.Add(new CuiPanel
            {
                Image = { Color = PanelBg },
                RectTransform = { AnchorMin = "0 1", AnchorMax = "0 1", OffsetMin = min, OffsetMax = max }
            }, ReportRoot, card);

            if (target == null) return;

            AddAvatar(container, card, target.SteamId);

            // Градиент снизу, чтобы ник читался на любой аватарке.
            container.Add(new CuiPanel
            {
                Image =
                {
                    Sprite = "assets/content/ui/ui.background.transparent.linear.psd",
                    Color = "0.157 0.157 0.157 0.95"
                },
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "0 0", OffsetMax = "0 0" }
            }, card, card + ".shade");

            var name = string.IsNullOrEmpty(target.Name) ? "Unknown" : target.Name;

            AddText(container, card, ".name", Trim(Sanitize(name), MaxNameChars), 13, Accent,
                Rect("0 0", "1 1", 6, 16, 0, 0), TextAnchor.LowerLeft, FontBold);

            AddText(container, card, ".id", target.SteamId, 10, AccentDim,
                Rect("0 0", "1 1", 6, 5, 0, 0), TextAnchor.LowerLeft, FontRegular);

            container.Add(new CuiButton
            {
                Button =
                {
                    Color = "0 0 0 0",
                    Command = "ynazicottv.report.select " + target.SteamId + " " + slot
                },
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "0 0", OffsetMax = "0 0" },
                Text = { Text = "" }
            }, card, card + ".click");
        }

        /// Окно выбора причины: раскрывается из самой карточки, остальное гаснет.
        /// Клик мимо возвращает к списку, клик по причине сразу отправляет репорт.
        private void DrawReasonPopup(CuiElementContainer container, ReportUiState state)
        {
            var target = state.Target;
            var slot = Math.Max(0, Math.Min(state.Slot, ReportPerPage - 1));
            // Для правой половины сетки разворачиваем содержимое влево, иначе оно уедет за экран.
            var left = slot % ReportColumns >= ReportColumns / 2;

            var side = left ? "0 0" : "1 0";
            var sideTop = left ? "0 1" : "1 1";

            string min, max;
            CardBox(slot, out min, out max);

            container.Add(new CuiPanel
            {
                Image = { Color = "0 0 0 1" },
                RectTransform = { AnchorMin = "0 1", AnchorMax = "0 1", OffsetMin = min, OffsetMax = max }
            }, ReportRoot, ReportPopup);

            // Три подложки: тёмный ореол вокруг карточки, светлый — со стороны текста,
            // и блюр на весь экран. Клик по любой возвращает к списку.
            container.Add(new CuiButton
            {
                Button =
                {
                    Color = "0 0 0 1",
                    Sprite = "assets/content/ui/gameui/attackheli/compass/ui.soft.radial.png",
                    Command = "ynazicottv.report.back"
                },
                RectTransform =
                {
                    AnchorMin = "0 0", AnchorMax = "1 1",
                    OffsetMin = "-500 -500", OffsetMax = "500 500"
                },
                Text = { Text = "" }
            }, ReportPopup, ReportPopup + ".glow");

            container.Add(new CuiButton
            {
                Button =
                {
                    Color = "0.204 0.204 0.204",
                    Sprite = "assets/content/ui/gameui/attackheli/compass/ui.soft.radial.png",
                    Command = "ynazicottv.report.back"
                },
                RectTransform =
                {
                    AnchorMin = left ? "-1 0" : "2 0", AnchorMax = left ? "-2 1" : "3 1",
                    OffsetMin = "-500 -500", OffsetMax = "500 500"
                },
                Text = { Text = "" }
            }, ReportPopup, ReportPopup + ".side");

            container.Add(new CuiButton
            {
                Button =
                {
                    Color = "0 0 0 0.5",
                    Material = "assets/content/ui/uibackgroundblur-ingamemenu.mat",
                    Command = "ynazicottv.report.back"
                },
                RectTransform =
                {
                    AnchorMin = "0 0", AnchorMax = "1 1",
                    OffsetMin = "-1111111 -1111111", OffsetMax = "1111111 1111111"
                },
                Text = { Text = "" }
            }, ReportPopup, ReportPopup + ".dim");

            AddText(container, ReportPopup, ".head", "Select the reason for the report", 24, Accent,
                Rect(side, sideTop, left ? -350 : 20, 0, left ? -20 : 350, -5),
                left ? TextAnchor.UpperRight : TextAnchor.UpperLeft, FontBold);

            var name = string.IsNullOrEmpty(target.Name) ? target.SteamId : target.Name;

            AddText(container, ReportPopup, ".subhead", "For player <b>" + Trim(Sanitize(name), 24) + "</b>",
                14, AccentDim, Rect(side, sideTop, left ? -250 : 20, 0, left ? -20 : 250, -35),
                left ? TextAnchor.UpperRight : TextAnchor.UpperLeft, FontRegular);

            // Аватарку рисуем после подложек — иначе блюр закроет саму карточку.
            AddAvatar(container, ReportPopup, target.SteamId);

            DrawReasonMessage(container, state, left, side);

            var reasons = _config.Reports.Reasons;
            for (var i = 0; i < reasons.Count && i < 6; i++)
            {
                var x0 = 20 + i * 85;
                var x1 = x0 + 80;

                container.Add(new CuiButton
                {
                    Button = { Color = AccentFaint, Command = "ynazicottv.report.reason " + i },
                    RectTransform =
                    {
                        AnchorMin = side, AnchorMax = side,
                        OffsetMin = Px(left ? -x1 : x0, 15), OffsetMax = Px(left ? -x0 : x1, 45)
                    },
                    Text =
                    {
                        Text = reasons[i], FontSize = 14, Align = TextAnchor.MiddleCenter, Color = Accent
                    }
                }, ReportPopup, ReportPopup + ".reason" + i);
            }
        }

        /// Комментарий необязателен: причина отправляет репорт сразу, текст уезжает вместе с ней.
        private void DrawReasonMessage(CuiElementContainer container, ReportUiState state, bool left, string side)
        {
            container.Add(new CuiPanel
            {
                Image = { Color = PanelBg },
                RectTransform =
                {
                    AnchorMin = side, AnchorMax = side,
                    OffsetMin = Px(left ? -350 : 20, 55), OffsetMax = Px(left ? -20 : 350, 85)
                }
            }, ReportPopup, ReportMessage);

            if (string.IsNullOrEmpty(state.Message))
            {
                AddText(container, ReportMessage, ".hint", "Опишите, что случилось (необязательно)", 12,
                    AccentDim, Rect("0 0", "1 1", 10, 0, -10, 0), TextAnchor.MiddleLeft, FontRegular);
            }

            container.Add(new CuiElement
            {
                Name = ReportMessage + ".input",
                Parent = ReportMessage,
                Components =
                {
                    new CuiInputFieldComponent
                    {
                        Text = state.Message ?? "",
                        FontSize = 12,
                        Font = FontRegular,
                        Align = TextAnchor.MiddleLeft,
                        Color = Accent,
                        CharsLimit = MaxReportMessage,
                        Command = "ynazicottv.report.message"
                    },
                    Rect("0 0", "1 1", 10, 0, -10, 0)
                }
            });
        }

        /// Аватарку рисует сам клиент по SteamID — плагину не нужны запросы в Steam.
        private void AddAvatar(CuiElementContainer container, string parent, string steamId)
        {
            if (!_config.Reports.LoadAvatars) return;

            container.Add(new CuiElement
            {
                Name = parent + ".avatar",
                Parent = parent,
                Components =
                {
                    new CuiRawImageComponent { SteamId = steamId, Sprite = "assets/icons/loading.png" },
                    Fill()
                }
            });
        }

        private static void AddText(CuiElementContainer container, string parent, string name, string text,
            int fontSize, string color, CuiRectTransformComponent rect, TextAnchor align, string font)
        {
            var label = new CuiLabel
            {
                Text = { Text = text, FontSize = fontSize, Font = font, Align = align, Color = color }
            };

            // RectTransform у CUI-элементов только для чтения — заполняем уже созданный компонент.
            label.RectTransform.AnchorMin = rect.AnchorMin;
            label.RectTransform.AnchorMax = rect.AnchorMax;
            label.RectTransform.OffsetMin = rect.OffsetMin;
            label.RectTransform.OffsetMax = rect.OffsetMax;

            container.Add(label, parent, parent + name);
        }

        /// Ячейка сетки по её номеру: отсчёт от левого верхнего угла контейнера.
        private static void CardBox(int slot, out string offsetMin, out string offsetMax)
        {
            var x = slot % ReportColumns * CardPitch;
            var y = -(slot / ReportColumns) * CardPitch;

            offsetMin = Px(x, y - CardSize);
            offsetMax = Px(x + CardSize, y);
        }

        /// Прямоугольник по якорям родителя со смещениями в пикселях.
        private static CuiRectTransformComponent Rect(string anchorMin, string anchorMax,
            int x0, int y0, int x1, int y1)
        {
            return new CuiRectTransformComponent
            {
                AnchorMin = anchorMin,
                AnchorMax = anchorMax,
                OffsetMin = Px(x0, y0),
                OffsetMax = Px(x1, y1)
            };
        }

        /// Растянуть элемент по всему родителю: у CUI по умолчанию OffsetMax = "1 1".
        private static CuiRectTransformComponent Fill()
        {
            return Rect("0 0", "1 1", 0, 0, 0, 0);
        }

        /// Точка в пикселях для OffsetMin/OffsetMax.
        private static string Px(int x, int y)
        {
            return x + " " + y;
        }

        #endregion

        #region Список игроков

        /// Без запроса — все, кто сейчас в сети, включая самого смотрящего. С запросом ищем
        /// и среди спящих, а по SteamID можно пожаловаться и на того, кто уже вышел с сервера.
        private List<ReportTarget> FindReportTargets(string query)
        {
            var result = new List<ReportTarget>();
            var needle = (query ?? "").Trim();
            var hasQuery = needle.Length > 0;
            var source = hasQuery
                ? (IEnumerable<BasePlayer>)BasePlayer.allPlayerList
                : (IEnumerable<BasePlayer>)BasePlayer.activePlayerList;

            foreach (var player in source)
            {
                if (player == null || player.IsNpc) continue;
                if (!player.IsConnected && !player.IsSleeping()) continue;

                var name = player.displayName ?? "";
                if (hasQuery
                    && name.IndexOf(needle, StringComparison.OrdinalIgnoreCase) < 0
                    && player.UserIDString.IndexOf(needle, StringComparison.Ordinal) < 0) continue;

                result.Add(new ReportTarget
                {
                    UserId = player.userID,
                    SteamId = player.UserIDString,
                    Name = name
                });
            }

            result.Sort((a, b) => string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase));

            if (result.Count == 0 && IsSteamId(needle))
            {
                result.Add(new ReportTarget
                {
                    UserId = ulong.Parse(needle),
                    SteamId = needle,
                    Name = ""
                });
            }

            return result;
        }

        private static string FindPlayerName(string steamId)
        {
            ulong userId;
            if (!ulong.TryParse(steamId, out userId)) return "";

            var player = BasePlayer.FindByID(userId) ?? BasePlayer.FindSleeping(userId);
            return player?.displayName ?? "";
        }

        private static bool IsSteamId(string value)
        {
            if (string.IsNullOrEmpty(value) || value.Length != 17) return false;

            foreach (var c in value)
            {
                if (c < '0' || c > '9') return false;
            }

            ulong parsed;
            return ulong.TryParse(value, out parsed);
        }

        /// Аргументы поля ввода приходят одной строкой в кавычках либо словами — склеиваем оба случая.
        private static string JoinArgs(ConsoleSystem.Arg arg)
        {
            if (arg.Args == null || arg.Args.Length == 0) return "";

            var sb = new StringBuilder();
            for (var i = 0; i < arg.Args.Length; i++)
            {
                if (sb.Length > 0) sb.Append(' ');
                sb.Append(arg.GetString(i) ?? "");
            }

            return sb.ToString().Trim();
        }

        private static string Trim(string value, int max)
        {
            if (string.IsNullOrEmpty(value) || value.Length <= max) return value;
            return value.Substring(0, Math.Max(1, max - 2)) + "..";
        }

        private static string FormatDuration(int seconds)
        {
            if (seconds < 60) return seconds + " сек";

            var minutes = (seconds + 59) / 60;
            return minutes + " мин";
        }

        #endregion

        #endregion

        #region Рисунки

        private void OnSignUpdated(Signage sign, BasePlayer player, int textureIndex)
        {
            if (!_config.TrackSigns || sign == null || player == null) return;

            byte[] image = null;
            try
            {
                if (sign.textureIDs != null && textureIndex >= 0 && textureIndex < sign.textureIDs.Length)
                {
                    var crc = sign.textureIDs[textureIndex];
                    if (crc != 0)
                        image = FileStorage.server.Get(crc, FileStorage.Type.png, sign.net.ID);
                }
            }
            catch (Exception ex)
            {
                PrintWarning("Не удалось прочитать изображение таблички: " + ex.Message);
            }

            if (image == null || image.Length == 0) return;

            var hash = Sha256Hex(image);
            var pos = sign.transform.position;

            var payload = new Dictionary<string, object>
            {
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["hash"] = hash,
                ["textureIndex"] = textureIndex,
                ["prefab"] = sign.ShortPrefabName,
                ["x"] = Math.Round(pos.x, 1),
                ["y"] = Math.Round(pos.y, 1),
                ["z"] = Math.Round(pos.z, 1),
                ["size"] = image.Length
            };

            // Само изображение уходит отдельным запросом, только если панель ответила needImage.
            Enqueue("/api/ingest/event", BuildEventBody("sign_updated", payload), RequestMethod.POST,
                (code, response) =>
                {
                    if (!NeedsImage(response)) return;
                    UploadSignImage(hash, image);
                });
        }

        private static bool NeedsImage(string response)
        {
            if (string.IsNullOrEmpty(response)) return false;
            try
            {
                var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(response);
                object need;
                return parsed != null && parsed.TryGetValue("needImage", out need)
                       && need is bool && (bool)need;
            }
            catch
            {
                return false;
            }
        }

        private void UploadSignImage(string hash, byte[] image)
        {
            // webrequest передаёт тело строкой, поэтому бинарник кладём в multipart-часть
            // с Content-Transfer-Encoding: base64 — так он переживает строковую передачу.
            var boundary = "----ynazicottv" + Guid.NewGuid().ToString("N");
            var sb = new StringBuilder();

            sb.Append("--").Append(boundary).Append("\r\n");
            sb.Append("Content-Disposition: form-data; name=\"hash\"\r\n\r\n");
            sb.Append(hash).Append("\r\n");

            sb.Append("--").Append(boundary).Append("\r\n");
            sb.Append("Content-Disposition: form-data; name=\"image\"; filename=\"").Append(hash).Append(".png\"\r\n");
            sb.Append("Content-Type: image/png\r\n");
            sb.Append("Content-Transfer-Encoding: base64\r\n\r\n");
            sb.Append(Convert.ToBase64String(image)).Append("\r\n");

            sb.Append("--").Append(boundary).Append("--\r\n");

            var body = sb.ToString();
            var headers = BuildHeaders(body);
            headers["Content-Type"] = "multipart/form-data; boundary=" + boundary;

            webrequest.Enqueue(_config.ApiUrl + "/api/ingest/sign-image", body,
                (code, response) =>
                {
                    if (code < 200 || code >= 300)
                        PrintWarning("Не удалось загрузить изображение таблички, код " + code);
                },
                this, RequestMethod.POST, headers, 20f);
        }

        #endregion

        #region Античит

        private void OnPlayerViolation(BasePlayer player, AntiHackType type, float amount)
        {
            if (!_config.AntiCheat.Enabled || !_config.AntiCheat.ReportViolations || player == null) return;

            var key = player.userID + ":" + type;
            ViolationCounter counter;
            if (!_violations.TryGetValue(key, out counter))
            {
                counter = new ViolationCounter { LastSentAt = -ViolationDebounceSec };
                _violations[key] = counter;
            }

            counter.Count++;
            if (amount > counter.MaxAmount) counter.MaxAmount = amount;

            if (Time.realtimeSinceStartup - counter.LastSentAt < ViolationDebounceSec) return;

            SendEvent("violation", new Dictionary<string, object>
            {
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["type"] = type.ToString(),
                ["amount"] = Math.Round(counter.MaxAmount, 2),
                ["count"] = counter.Count
            });

            counter.LastSentAt = Time.realtimeSinceStartup;
            counter.Count = 0;
            counter.MaxAmount = 0f;
        }

        // Только статистика, ничего не блокируем.
        private void OnEntityTakeDamage(BaseCombatEntity entity, HitInfo info)
        {
            if (!_config.AntiCheat.Enabled || info == null) return;

            var attacker = info.InitiatorPlayer;
            if (attacker == null || attacker.IsNpc) return;
            if (!(entity is BasePlayer)) return;

            var stats = GetCombat(attacker.userID);
            stats.Hits++;
            if (info.isHeadshot) stats.Headshots++;
        }

        private void OnWeaponFired(BaseProjectile projectile, BasePlayer player, ItemModProjectile mod,
            ProtoBuf.ProjectileShoot projectiles)
        {
            if (!_config.AntiCheat.Enabled || player == null) return;

            GetCombat(player.userID).Shots++;

            var now = Time.realtimeSinceStartup;
            ShotWindow window;
            if (!_shotWindows.TryGetValue(player.userID, out window))
            {
                window = new ShotWindow { WindowStart = now, LastReportedAt = -30f };
                _shotWindows[player.userID] = window;
            }

            if (now - window.WindowStart >= 1f)
            {
                window.WindowStart = now;
                window.Shots = 1;
                return;
            }

            window.Shots++;

            if (window.Shots > _config.AntiCheat.MaxShotsPerSecond && now - window.LastReportedAt > 10f)
            {
                window.LastReportedAt = now;
                SendEvent("combat_anomaly", new Dictionary<string, object>
                {
                    ["steamId"] = player.UserIDString,
                    ["name"] = player.displayName,
                    ["type"] = "firerate",
                    ["amount"] = window.Shots,
                    ["threshold"] = _config.AntiCheat.MaxShotsPerSecond
                });
            }
        }

        private void OnPlayerDeath(BasePlayer player, HitInfo info)
        {
            if (player == null || player.IsNpc) return;

            var killer = info?.InitiatorPlayer;
            bool pvp = killer != null && killer != player && !killer.IsNpc;

            // Смерть и убийство — две отдельные записи: по ним панель считает K/D.
            // Смерти учитываются любые, а не только от чужой руки, иначе падения
            // и урон от мира выпадали бы из знаменателя и K/D был бы завышен.
            _combatLogBuffer.Add(new Dictionary<string, object>
            {
                ["kind"] = "death",
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["killerSteamId"] = pvp ? killer.UserIDString : null,
                ["killerName"] = pvp ? killer.displayName : null,
                ["pvp"] = pvp,
                ["timestamp"] = Now()
            });

            if (pvp)
            {
                _combatLogBuffer.Add(new Dictionary<string, object>
                {
                    ["kind"] = "kill",
                    ["steamId"] = killer.UserIDString,
                    ["name"] = killer.displayName,
                    ["victimSteamId"] = player.UserIDString,
                    ["victimName"] = player.displayName,
                    ["headshot"] = info.isHeadshot,
                    ["weapon"] = info.Weapon?.ShortPrefabName ?? "unknown",
                    ["distance"] = Math.Round(Vector3.Distance(killer.transform.position, player.transform.position), 1),
                    ["timestamp"] = Now()
                });
            }

            if (_combatLogBuffer.Count >= CombatLogBatchSize) FlushCombatLog();

            if (!pvp || !_config.AntiCheat.Enabled) return;

            var distance = Vector3.Distance(killer.transform.position, player.transform.position);
            var stats = GetCombat(killer.userID);
            stats.Kills++;
            stats.TotalKillDistance += distance;
            if (distance > stats.MaxKillDistance) stats.MaxKillDistance = distance;

            if (distance > _config.AntiCheat.MaxKillDistance)
            {
                SendEvent("combat_anomaly", new Dictionary<string, object>
                {
                    ["steamId"] = killer.UserIDString,
                    ["name"] = killer.displayName,
                    ["type"] = "kill_distance",
                    ["amount"] = Math.Round(distance, 1),
                    ["threshold"] = _config.AntiCheat.MaxKillDistance,
                    ["weapon"] = info.Weapon?.ShortPrefabName ?? "unknown",
                    ["headshot"] = info.isHeadshot,
                    ["victimSteamId"] = player.UserIDString
                });
            }
        }

        /// Раз в 5 минут: агрегаты по активным игрокам, отправляем только превышения порогов.
        private void AggregateCombat()
        {
            if (_combat.Count == 0) return;

            foreach (var pair in _combat.ToList())
            {
                var stats = pair.Value;
                if (stats.Shots == 0 && stats.Kills == 0) continue;

                var player = BasePlayer.FindByID(pair.Key);
                var minutes = Math.Max(1.0, (DateTime.UtcNow - stats.WindowStart).TotalMinutes);

                var headshotRatio = stats.Hits > 0 ? (float)stats.Headshots / stats.Hits : 0f;
                var accuracy = stats.Shots > 0 ? (float)stats.Hits / stats.Shots : 0f;
                var avgKillDistance = stats.Kills > 0 ? stats.TotalKillDistance / stats.Kills : 0f;
                var shotsPerMinute = stats.Shots / minutes;

                var exceeds = (stats.Shots >= _config.AntiCheat.MinShotsForRatio
                               && headshotRatio >= _config.AntiCheat.HeadshotRatioThreshold)
                              || stats.MaxKillDistance > _config.AntiCheat.MaxKillDistance;

                if (exceeds)
                {
                    SendEvent("combat_anomaly", new Dictionary<string, object>
                    {
                        ["steamId"] = pair.Key.ToString(),
                        ["name"] = player?.displayName ?? "",
                        ["type"] = "aggregate",
                        ["amount"] = Math.Round(headshotRatio, 3),
                        ["headshotRatio"] = Math.Round(headshotRatio, 3),
                        ["accuracy"] = Math.Round(accuracy, 3),
                        ["avgKillDistance"] = Math.Round(avgKillDistance, 1),
                        ["maxKillDistance"] = Math.Round(stats.MaxKillDistance, 1),
                        ["shotsPerMinute"] = Math.Round(shotsPerMinute, 1),
                        ["shots"] = stats.Shots,
                        ["hits"] = stats.Hits,
                        ["kills"] = stats.Kills
                    });
                }

                stats.Reset();
            }
        }

        private CombatStats GetCombat(ulong userId)
        {
            CombatStats stats;
            if (!_combat.TryGetValue(userId, out stats))
            {
                stats = new CombatStats();
                _combat[userId] = stats;
            }
            return stats;
        }

        #endregion

        #region Heartbeat

        private void SendHeartbeat()
        {
            var players = new List<object>();

            foreach (var player in BasePlayer.allPlayerList)
            {
                if (player == null || !player.IsConnected) continue;

                var info = GetConnection(player);

                players.Add(new Dictionary<string, object>
                {
                    ["steamId"] = player.UserIDString,
                    ["name"] = player.displayName,
                    ["ip"] = info.Ip,
                    ["ping"] = GetPing(player),
                    ["connectedSec"] = (int)(DateTime.UtcNow - info.ConnectedAt).TotalSeconds,
                    ["isSleeping"] = player.IsSleeping(),
                    ["isAfk"] = IsAfk(player),
                    // По размеру команды панель показывает режим игры: соло/дуо/трио/сквад/клан.
                    ["teamSize"] = GetTeamSize(player),
                    ["language"] = GetLanguage(player),
                    ["ownerSteamId"] = info.OwnerId == 0UL ? player.UserIDString : info.OwnerId.ToString(),
                    ["familyShare"] = info.FamilyShare,
                    ["licensed"] = info.Licensed,
                    ["authLevel"] = info.AuthLevel
                });
            }

            var body = new Dictionary<string, object>
            {
                ["serverId"] = _config.ServerId,
                ["serverName"] = ConVar.Server.hostname,
                ["timestamp"] = Now(),
                ["hostname"] = ConVar.Server.hostname,
                ["maxPlayers"] = ConVar.Server.maxplayers,
                ["uptimeSec"] = (int)Time.realtimeSinceStartup,
                ["queuedPlayers"] = GetQueueCount(false),
                ["joiningPlayers"] = GetQueueCount(true),
                // По этой паре панель находит карту на rustmaps.
                ["seed"] = World.Seed,
                ["worldSize"] = World.Size,
                ["players"] = players
            };

            Enqueue("/api/ingest/heartbeat", JsonConvert.SerializeObject(body), RequestMethod.POST, null);
        }

        #endregion

        #region Карта и позиции

        /// Координаты бодрствующих игроков. Через очередь не гоняем: устаревшие точки бесполезны,
        /// поэтому пропущенный тик лучше молча потерять, чем ретраить.
        private void SendPositions()
        {
            var players = new List<object>();

            foreach (var player in BasePlayer.activePlayerList)
            {
                if (player == null || !player.IsConnected) continue;

                var pos = player.transform.position;
                players.Add(new Dictionary<string, object>
                {
                    ["steamId"] = player.UserIDString,
                    ["name"] = player.displayName,
                    ["x"] = Math.Round(pos.x, 1),
                    ["y"] = Math.Round(pos.y, 1),
                    ["z"] = Math.Round(pos.z, 1),
                    ["isAfk"] = IsAfk(player)
                });
            }

            var body = JsonConvert.SerializeObject(new Dictionary<string, object>
            {
                ["serverId"] = _config.ServerId,
                ["timestamp"] = Now(),
                ["players"] = players
            });

            SendNow("/api/ingest/positions", body, RequestMethod.POST, null);
        }

        /// Спрашиваем панель, есть ли у неё карта текущего вайпа.
        private void CheckMapUpload()
        {
            if (_mapScanRunning) return;

            var url = "/api/ingest/map?seed=" + World.Seed + "&size=" + World.Size;
            SendNow(url, "", RequestMethod.GET, (code, response) =>
            {
                if (code != 200 || string.IsNullOrEmpty(response)) return;

                try
                {
                    var parsed = JsonConvert.DeserializeObject<Dictionary<string, object>>(response);
                    object needs;
                    if (parsed != null && parsed.TryGetValue("needsUpload", out needs)
                        && needs is bool && (bool)needs)
                    {
                        ScanTerrain();
                    }
                }
                catch (Exception ex)
                {
                    PrintWarning("Не удалось разобрать ответ по карте: " + ex.Message);
                }
            });
        }

        /// Снимаем высоты сеткой, порциями строк по таймеру — за один кадр это делать нельзя.
        private void ScanTerrain()
        {
            if (_mapScanRunning) return;
            _mapScanRunning = true;

            var res = Mathf.Clamp(_config.MapResolution, 64, 1024);
            var worldSize = TerrainMeta.Size.x;
            var half = worldSize / 2f;
            var step = worldSize / res;

            var heights = new float[res * res];
            var minHeight = float.MaxValue;
            var maxHeight = float.MinValue;
            var row = 0;

            const int RowsPerTick = 32;

            _mapScanTimer = timer.Every(0.05f, () =>
            {
                var end = Mathf.Min(row + RowsPerTick, res);

                for (; row < end; row++)
                {
                    // строка 0 — юг: панель разворачивает сетку при отрисовке
                    var z = -half + (row + 0.5f) * step;

                    for (var col = 0; col < res; col++)
                    {
                        var x = -half + (col + 0.5f) * step;
                        var h = TerrainMeta.HeightMap.GetHeight(new Vector3(x, 0f, z));

                        heights[row * res + col] = h;
                        if (h < minHeight) minHeight = h;
                        if (h > maxHeight) maxHeight = h;
                    }
                }

                if (row < res) return;

                _mapScanTimer?.Destroy();
                _mapScanTimer = null;
                _mapScanRunning = false;

                UploadTerrain(res, worldSize, heights, minHeight, maxHeight);
            });
        }

        private void UploadTerrain(int res, float worldSize, float[] heights, float minHeight, float maxHeight)
        {
            var range = Mathf.Max(0.001f, maxHeight - minHeight);
            var bytes = new byte[heights.Length];

            for (var i = 0; i < heights.Length; i++)
            {
                var normalized = Mathf.RoundToInt((heights[i] - minHeight) / range * 255f);
                bytes[i] = (byte)Mathf.Clamp(normalized, 0, 255);
            }

            var body = JsonConvert.SerializeObject(new Dictionary<string, object>
            {
                ["seed"] = World.Seed,
                ["worldSize"] = (int)worldSize,
                ["resolution"] = res,
                ["minHeight"] = Math.Round(minHeight, 2),
                ["maxHeight"] = Math.Round(maxHeight, 2),
                ["heights"] = Convert.ToBase64String(bytes)
            });

            SendNow("/api/ingest/map", body, RequestMethod.POST, (code, response) =>
            {
                if (code >= 200 && code < 300)
                    Puts("Карта отправлена в панель: " + res + "x" + res + ", мир " + (int)worldSize + " м.");
                else
                    PrintWarning("Не удалось отправить карту (код " + code + "): " + Shorten(response));
            });
        }

        #endregion

        #region Команды от панели

        private void PollCommands()
        {
            // GET подписывается пустым телом.
            SendNow("/api/ingest/commands", "", RequestMethod.GET, (code, response) =>
            {
                if (code != 200 || string.IsNullOrEmpty(response)) return;

                CommandsResponse parsed;
                try
                {
                    parsed = JsonConvert.DeserializeObject<CommandsResponse>(response);
                }
                catch (Exception ex)
                {
                    PrintWarning("Не удалось разобрать очередь команд: " + ex.Message);
                    return;
                }

                if (parsed?.Commands == null || parsed.Commands.Count == 0) return;

                foreach (var command in parsed.Commands) ExecuteCommand(command);
            });
        }

        private class CommandsResponse
        {
            [JsonProperty("commands")] public List<PanelCommand> Commands { get; set; }
        }

        private class PanelCommand
        {
            [JsonProperty("id")] public string Id { get; set; }
            [JsonProperty("type")] public string Type { get; set; }
            [JsonProperty("steamId")] public string SteamId { get; set; }
            [JsonProperty("reason")] public string Reason { get; set; }
            /// Логин сотрудника панели, поставившего команду. Им подписано сообщение
            /// в Discord; у панелей старше 1.5.0 поля нет и подпись остаётся общей.
            [JsonProperty("admin")] public string Admin { get; set; }
        }

        private void ExecuteCommand(PanelCommand command)
        {
            if (command == null || string.IsNullOrEmpty(command.Id)) return;
            // Реплика панели адресована всему серверу, у остальных команд есть игрок.
            if (command.Type != "say" && string.IsNullOrEmpty(command.SteamId)) return;

            var reason = string.IsNullOrEmpty(command.Reason) ? "YnaziCotTV" : command.Reason;

            switch (command.Type)
            {
                case "say":
                    SayFromPanel(command.Reason);
                    break;
                case "kick":
                    rust.RunServerCommand("kick", command.SteamId, reason);
                    break;
                case "ban":
                    EndCheck(command.SteamId);
                    BanId(command.SteamId, reason, command.Admin);
                    break;
                case "ban_team":
                    EndCheck(command.SteamId);
                    BanTeam(command.SteamId, reason, command.Admin);
                    break;
                case "unban":
                    // Консольная команда называется `unban`; `unbanid` в Rust нет,
                    // сервер на неё отвечает «Command 'unbanid' not found».
                    MarkPanelAction("unban", command.SteamId, command.Admin);
                    rust.RunServerCommand("unban", command.SteamId);
                    break;
                case "check":
                    // Игрока не кикаем и не баним — только показываем предупреждение на экране.
                    StartCheck(command.SteamId);
                    ShowCheckWarning(command.SteamId, reason);
                    break;
                case "check_banner":
                    StartCheck(command.SteamId);
                    ShowCheckBanner(command.SteamId, reason);
                    break;
                case "check_banner_hide":
                    HideCheckBanner(command.SteamId);
                    break;
                case "check_pm":
                    // Проверка могла начаться до перезагрузки плагина — метку восстанавливаем.
                    StartCheck(command.SteamId);
                    SendCheckMessage(command.SteamId, reason);
                    break;
                case "check_result":
                    SendCheckResult(command.SteamId, reason);
                    break;
                case "check_announce":
                    AnnounceCheckResult(reason);
                    break;
                case "check_end":
                    EndCheck(command.SteamId);
                    break;
                default:
                    // Команду всё равно подтверждаем: иначе панель считает её отправленной,
                    // а очередь копит её вечно. Обычно это значит, что на сервере лежит
                    // плагин старее панели — обновите его из раздела «Начало работы».
                    PrintWarning("Неизвестный тип команды: " + command.Type
                        + ". Обновите плагин: на сервере " + Version + ".");
                    break;
            }

            Enqueue("/api/ingest/commands/" + command.Id + "/ack", "{}", RequestMethod.POST, null);
        }

        /// Вызов на проверку: баннер на весь экран поднимается сразу, плюс дубль в чат,
        /// чтобы текст остался в истории после того, как баннер снимут.
        /// Панель ставит команду только для игрока в сети, поэтому промах — редкий случай:
        /// команда всё равно подтверждается, повторов очередь не делает.
        private void ShowCheckWarning(string steamId, string message)
        {
            var player = FindConnected(steamId);
            if (player == null)
            {
                PrintWarning("Вызов на проверку: игрока " + steamId + " нет на сервере.");
                return;
            }

            ShowCheckBanner(steamId, null);
            SendReply(player, "<color=#ef4444>ПРОВЕРКА</color> " + message);
        }

        /// Игрок под проверкой: его сообщения уходят в панель сразу,
        /// а очередь команд опрашивается чаще, чтобы чат панели не отставал.
        private void StartCheck(string steamId)
        {
            ulong userId;
            if (!ulong.TryParse(steamId, out userId)) return;

            if (_checked.Add(userId)) UpdateCommandPollRate();
        }

        /// Проверка закрыта: снимаем баннер и возвращаем обычный темп опроса.
        private void EndCheck(string steamId)
        {
            ulong userId;
            if (!ulong.TryParse(steamId, out userId)) return;

            HideCheckBanner(steamId);
            if (_checked.Remove(userId)) UpdateCommandPollRate();
        }

        private void UpdateCommandPollRate()
        {
            var interval = _checked.Count > 0
                ? CheckPollIntervalSec
                : Math.Max(5, _config.CommandPollIntervalSec);

            if (Math.Abs(_commandPollInterval - interval) < 0.01f) return;

            _commandPollInterval = interval;
            _commandTimer?.Destroy();
            _commandTimer = timer.Every(interval, PollCommands);
        }

        /// Баннер на весь экран: крупный красный заголовок по центру и пояснения под ним.
        /// Слой прозрачный, курсор не включаем — игрок продолжает играть и видеть вызов,
        /// читаемость поверх игры даёт чёрная обводка текста.
        private void ShowCheckBanner(string steamId, string headline)
        {
            var player = FindConnected(steamId);
            if (player == null)
            {
                PrintWarning("Баннер проверки: игрока " + steamId + " нет на сервере.");
                return;
            }

            CuiHelper.DestroyUi(player, CheckBannerPanel);

            var container = new CuiElementContainer();

            var root = container.Add(new CuiPanel
            {
                Image = { Color = "0 0 0 0" },
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1" },
                CursorEnabled = false
            }, "Overlay", CheckBannerPanel);

            AddBannerText(container, root, "head",
                string.IsNullOrEmpty(headline) ? BannerHeadline : headline,
                46, "0.85 0.12 0.12 1", "0.585", "0.680", "robotocondensed-bold.ttf");

            // Три пояснительные строки идут вплотную друг под другом, как на образце.
            for (var i = 0; i < BannerLines.Length; i++)
            {
                var top = 0.575f - i * 0.038f;
                AddBannerText(container, root, "line" + i, BannerLines[i],
                    17, "1 1 1 1",
                    (top - 0.038f).ToString("0.000", CultureInfo.InvariantCulture),
                    top.ToString("0.000", CultureInfo.InvariantCulture),
                    "robotocondensed-regular.ttf");
            }

            AddBannerText(container, root, "cmd", BannerCommandLine,
                17, "1 1 1 1", "0.385", "0.425", "robotocondensed-bold.ttf");

            CuiHelper.AddUi(player, container);
            _banners.Add(player.userID);
        }

        /// Строка баннера с чёрной обводкой. CuiLabel обводку не умеет,
        /// поэтому собираем элемент из компонентов вручную.
        private static void AddBannerText(CuiElementContainer container, string parent, string name,
            string text, int fontSize, string color, string yMin, string yMax, string font)
        {
            container.Add(new CuiElement
            {
                Name = CheckBannerPanel + "." + name,
                Parent = parent,
                Components =
                {
                    new CuiTextComponent
                    {
                        Text = text,
                        FontSize = fontSize,
                        Font = font,
                        Align = TextAnchor.MiddleCenter,
                        Color = color
                    },
                    new CuiOutlineComponent { Color = "0 0 0 0.9", Distance = "1.1 -1.1" },
                    new CuiRectTransformComponent { AnchorMin = "0 " + yMin, AnchorMax = "1 " + yMax }
                }
            });
        }

        private void HideCheckBanner(string steamId)
        {
            ulong userId;
            if (!ulong.TryParse(steamId, out userId)) return;

            var player = BasePlayer.FindByID(userId);
            if (player != null && player.IsConnected) CuiHelper.DestroyUi(player, CheckBannerPanel);

            _banners.Remove(userId);
        }

        private void HideAllCheckBanners()
        {
            foreach (var userId in _banners.ToList())
            {
                var player = BasePlayer.FindByID(userId);
                if (player != null && player.IsConnected)
                    CuiHelper.DestroyUi(player, CheckBannerPanel);
            }

            _banners.Clear();
        }

        /// Личное сообщение от панели: видит только этот игрок.
        private void SendCheckMessage(string steamId, string text)
        {
            if (string.IsNullOrEmpty(text)) return;

            var player = FindConnected(steamId);
            if (player == null)
            {
                PrintWarning("Сообщение проверки: игрока " + steamId + " нет на сервере.");
                return;
            }

            SendReply(player, "<color=#6c5ce7>[ПРОВЕРКА]</color> " + Sanitize(text));
        }

        /// Итог проверки лично игроку. Панель ставит эту команду перед баном,
        /// чтобы игрок успел прочитать причину до отключения.
        private void SendCheckResult(string steamId, string text)
        {
            if (string.IsNullOrEmpty(text)) return;

            var player = FindConnected(steamId);
            if (player == null)
            {
                PrintWarning("Итог проверки: игрока " + steamId + " нет на сервере.");
                return;
            }

            SendReply(player, "<color=#ef4444>[ПРОВЕРКА]</color> " + Sanitize(text));
        }

        /// Объявление об итоге на весь сервер — панель шлёт его только для банов.
        private void AnnounceCheckResult(string text)
        {
            if (string.IsNullOrEmpty(text)) return;

            var line = "<color=#ef4444>[ПРОВЕРКА]</color> " + Sanitize(text);
            foreach (var player in BasePlayer.activePlayerList)
            {
                if (player != null && player.IsConnected) SendReply(player, line);
            }
        }

        /// Реплика модератора из панели — всем, кто сейчас на сервере.
        /// Текст приходит готовой строкой «ник: сообщение», префикс добавляем здесь.
        private void SayFromPanel(string text)
        {
            if (string.IsNullOrEmpty(text)) return;

            var line = "<color=#3b82f6>[ПАНЕЛЬ]</color> " + Sanitize(text);
            foreach (var player in BasePlayer.activePlayerList)
            {
                if (player != null && player.IsConnected) SendReply(player, line);
            }
        }

        /// Угловые скобки убираем, иначе текст из панели поломает разметку чата.
        private static string Sanitize(string text)
        {
            return text.Replace('<', '(').Replace('>', ')');
        }

        /// Бан всей команды игрока. Если команды нет — банится он один.
        private void BanTeam(string steamId, string reason, string admin)
        {
            ulong userId;
            if (!ulong.TryParse(steamId, out userId))
            {
                PrintWarning("Бан тимы: некорректный SteamID " + steamId);
                return;
            }

            var ids = new List<ulong>();

            try
            {
                var player = BasePlayer.FindByID(userId) ?? BasePlayer.FindSleeping(userId);
                var teamId = player?.currentTeam ?? 0UL;

                if (teamId != 0UL)
                {
                    var team = RelationshipManager.ServerInstance?.FindTeam(teamId);
                    if (team?.members != null) ids.AddRange(team.members);
                }
            }
            catch (Exception ex)
            {
                PrintWarning("Бан тимы: не удалось прочитать состав команды: " + ex.Message);
            }

            if (!ids.Contains(userId)) ids.Add(userId);

            foreach (var id in ids)
            {
                EndCheck(id.ToString());
                BanId(id.ToString(), reason, admin);
            }
        }

        /// Бан по SteamID. У консольной команды три аргумента — `banid <id> <ник> <причина>`,
        /// поэтому причину нельзя ставить вторым: она уедет в поле ника, а в бан-листе
        /// сервера причина останется пустой.
        private void BanId(string steamId, string reason, string admin)
        {
            // Сюда приходят только баны из панели: по этой отметке OnUserBanned
            // отличит их от бана, выданного руками в консоли сервера, и заодно
            // узнает, кем он выдан.
            MarkPanelAction("ban", steamId, admin);

            var name = steamId;

            ulong userId;
            if (ulong.TryParse(steamId, out userId))
            {
                var player = BasePlayer.FindByID(userId) ?? BasePlayer.FindSleeping(userId);
                if (player != null && !string.IsNullOrEmpty(player.displayName)) name = player.displayName;
            }

            rust.RunServerCommand("banid", steamId, Sanitize(name), Sanitize(reason));
        }

        private static BasePlayer FindConnected(string steamId)
        {
            ulong userId;
            if (!ulong.TryParse(steamId, out userId)) return null;

            var player = BasePlayer.FindByID(userId);
            return player != null && player.IsConnected ? player : null;
        }

        #endregion

        #region Подключение к панели

        /// Единственный шаг настройки: `ynazicottv.setup <код>`.
        /// Адрес панели берётся из конфига (ApiUrl); если она развёрнута по другому адресу,
        /// его можно передать первым аргументом: `ynazicottv.setup <адрес> <код>`.
        /// Код одноразовый, панель показывает его в разделе «Подключить сервер».
        /// В ответ приходят serverId/serverKey/serverSecret — плагин сам пишет их в конфиг.
        [ConsoleCommand("ynazicottv.setup")]
        private void CmdSetup(ConsoleSystem.Arg arg)
        {
            // Только серверная консоль и владелец: у игроков authLevel < 2.
            if (arg.Connection != null && arg.Connection.authLevel < 2)
            {
                arg.ReplyWith("Нет доступа.");
                return;
            }

            // arg.Args в свежих сборках Rust — StringView[], а не string[],
            // поэтому читаем аргументы через GetString: он всегда отдаёт string.
            if (!arg.HasArgs(1))
            {
                arg.ReplyWith(
                    "Использование: ynazicottv.setup <код>\n" +
                    "Если панель развёрнута не по адресу из конфига: ynazicottv.setup <адрес> <код>");
                return;
            }

            string apiUrl;
            string code;

            if (arg.HasArgs(2))
            {
                apiUrl = (arg.GetString(0) ?? "").Trim().TrimEnd('/');
                code = (arg.GetString(1) ?? "").Trim();
            }
            else
            {
                // Адрес уже в конфиге — достаточно одного кода.
                apiUrl = (_config.ApiUrl ?? "").Trim().TrimEnd('/');
                code = (arg.GetString(0) ?? "").Trim();
                if (string.IsNullOrEmpty(apiUrl))
                {
                    arg.ReplyWith("Адрес панели не задан. Формат: ynazicottv.setup <адрес> <код>");
                    return;
                }
            }

            if (string.IsNullOrEmpty(code))
            {
                arg.ReplyWith("Не передан код подключения. Формат: ynazicottv.setup <код>");
                return;
            }

            if (!apiUrl.StartsWith("http://") && !apiUrl.StartsWith("https://"))
            {
                arg.ReplyWith("Адрес панели должен начинаться с http:// или https://");
                return;
            }

            var body = JsonConvert.SerializeObject(new Dictionary<string, object>
            {
                ["code"] = code,
                ["name"] = ConVar.Server.hostname,
                ["hostname"] = ConVar.Server.hostname,
                ["maxPlayers"] = ConVar.Server.maxplayers
            });

            // Единственный запрос без подписи: секрет выдаётся именно им.
            var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };

            var url = apiUrl + "/api/pair";
            arg.ReplyWith("YnaziCotTV: подключаюсь к " + url + " ...");

            webrequest.Enqueue(url, body, (respCode, response) =>
            {
                if (respCode != 200)
                {
                    // Печатаем и адрес, и сырой ответ: без них 404 неотличим от «панель не та».
                    PrintError(
                        "Подключение не удалось (код " + respCode + "): " + DescribePairError(respCode, response) + "\n" +
                        "Адрес запроса: " + url + "\n" +
                        "Ответ сервера: " + Shorten(response));
                    return;
                }

                PairResponse parsed;
                try
                {
                    parsed = JsonConvert.DeserializeObject<PairResponse>(response);
                }
                catch (Exception ex)
                {
                    PrintError("Панель вернула неожиданный ответ: " + ex.Message);
                    return;
                }

                if (parsed == null || string.IsNullOrEmpty(parsed.ServerKey) || string.IsNullOrEmpty(parsed.ServerSecret))
                {
                    PrintError("Панель не прислала ключи сервера.");
                    return;
                }

                _config.ApiUrl = apiUrl;
                _config.ServerId = parsed.ServerId;
                _config.ServerKey = parsed.ServerKey;
                _config.ServerSecret = parsed.ServerSecret;
                SaveConfig();

                StartTimers();
                SendHeartbeat();

                Puts("Сервер подключён к панели: " + (parsed.ServerName ?? parsed.ServerId) +
                     " (id: " + parsed.ServerId + "). Ключи сохранены в конфиг.");
            }, this, RequestMethod.POST, headers, 15f);
        }

        /// Состояние подключения прямо из консоли, без входа в игру.
        [ConsoleCommand("ynazicottv.status")]
        private void CmdConsoleStatus(ConsoleSystem.Arg arg)
        {
            if (arg.Connection != null && arg.Connection.authLevel < 2)
            {
                arg.ReplyWith("Нет доступа.");
                return;
            }

            arg.ReplyWith(StatusText());
        }

        /// Проверка вебхуков: показывает, что реально лежит в конфиге у работающего
        /// плагина, и шлёт тестовое сообщение. Без неё «репорт не дошёл» неотличимо
        /// от «вебхук пуст»: пустой адрес отправка пропускает молча.
        [ConsoleCommand("ynazicottv.discordtest")]
        private void CmdConsoleDiscordTest(ConsoleSystem.Arg arg)
        {
            if (arg.Connection != null && arg.Connection.authLevel < 2)
            {
                arg.ReplyWith("Нет доступа.");
                return;
            }

            var discord = _config.Discord;
            var bans = (arg.GetString(0) ?? "reports").ToLowerInvariant() == "bans";
            var url = bans ? discord.BansWebhook : discord.ReportsWebhook;
            var enabled = bans ? discord.NotifyBans : discord.NotifyReports;

            arg.ReplyWith(
                "Discord у загруженного плагина:\n" +
                "  BansWebhook: " + DescribeWebhook(discord.BansWebhook) + "\n" +
                "  ReportsWebhook: " + DescribeWebhook(discord.ReportsWebhook) + "\n" +
                "  NotifyBans: " + discord.NotifyBans +
                ", NotifyUnbans: " + discord.NotifyUnbans +
                ", NotifyReports: " + discord.NotifyReports + "\n" +
                "  ServerName: " + DiscordServerName());

            if (string.IsNullOrEmpty(url))
            {
                arg.ReplyWith("Адрес пуст — слать некуда. Впишите его в конфиг и перезагрузите плагин: "
                              + "oxide.reload YnaziCotTvBridge");
                return;
            }

            if (!enabled)
                arg.ReplyWith("Внимание: выключатель Notify" + (bans ? "Bans" : "Reports")
                              + " стоит в false — настоящие события уходить не будут, тест отправляю всё равно.");

            arg.ReplyWith("Отправляю тестовое сообщение...");

            PostToDiscord(url, "Проверка вебхука", bans ? ColorBan : ColorReport, new List<object>
            {
                DiscordField("Канал", bans ? "Баны" : "Репорты", true),
                DiscordField("Сервер", DiscordServerName(), true)
            }, (code, response) =>
            {
                if (code >= 200 && code < 300) Puts("Discord: тестовое сообщение доставлено (код " + code + ").");
                // Про неудачу PostToDiscord уже написал сам — второй раз не повторяем.
            });
        }

        /// Что видно про адрес, не показывая токен вебхука целиком.
        private static string DescribeWebhook(string url)
        {
            if (string.IsNullOrEmpty(url)) return "пусто (сообщения не отправляются)";

            if (!url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                || url.IndexOf("/api/webhooks/", StringComparison.OrdinalIgnoreCase) < 0)
                return "не похож на вебхук: " + Trim(url, 60);

            return "задан, " + url.Length + " символов: " + Trim(url, 45);
        }

        /// Ответ может быть HTML-страницей на сотни килобайт — в консоль столько не нужно.
        private static string Shorten(string value)
        {
            if (string.IsNullOrEmpty(value)) return "(пусто)";
            var flat = value.Replace("\r", " ").Replace("\n", " ").Trim();
            return flat.Length <= 200 ? flat : flat.Substring(0, 200) + "…";
        }

        private static string DescribePairError(int code, string response)
        {
            if (!string.IsNullOrEmpty(response))
            {
                try
                {
                    var parsed = JsonConvert.DeserializeObject<Dictionary<string, string>>(response);
                    string message;
                    if (parsed != null && parsed.TryGetValue("error", out message) && !string.IsNullOrEmpty(message))
                        return message;
                }
                catch
                {
                    /* тело не JSON — покажем общий текст ниже */
                }
            }

            if (code == 0) return "панель недоступна, проверьте адрес и сеть";
            // Свой 404 панель отдаёт с полем error. Если его нет — по адресу отвечает не панель.
            if (code == 404) return "по этому адресу нет эндпоинта /api/pair — проверьте ApiUrl";
            if (code == 409) return "код уже использован";
            if (code == 410) return "код просрочен, получите новый в панели";
            return "неизвестная ошибка";
        }

        private class PairResponse
        {
            [JsonProperty("serverId")] public string ServerId { get; set; }
            [JsonProperty("serverKey")] public string ServerKey { get; set; }
            [JsonProperty("serverSecret")] public string ServerSecret { get; set; }
            [JsonProperty("serverName")] public string ServerName { get; set; }
        }

        private string StatusText()
        {
            if (!IsConfigured)
                return "YnaziCotTV: сервер не подключён.\n" +
                       "Выполните: ynazicottv.setup <код>";

            var since = (int)(DateTime.UtcNow - _lastSuccessAt).TotalSeconds;
            return "YnaziCotTV\n" +
                   "Панель: " + _config.ApiUrl + "\n" +
                   "Сервер: " + _config.ServerId + "\n" +
                   "Очередь: " + _queue.Count + " / " + MaxQueueSize + "\n" +
                   "Последний успешный запрос: " + since + " сек назад";
        }

        #endregion

        #region Чат-команды

        [ChatCommand("panel")]
        private void CmdYnaziCotTV(BasePlayer player, string command, string[] args)
        {
            if (player == null) return;

            if (!permission.UserHasPermission(player.UserIDString, PermAdmin))
            {
                SendReply(player, "Нет доступа.");
                return;
            }

            if (args == null || args.Length == 0 || args[0] != "status")
            {
                SendReply(player, "Использование: /panel status");
                return;
            }

            SendReply(player, StatusText());
        }

        /// Ответ игрока на вызов проверки: `/ds <дискорд>`. Доступен всем — именно эту команду
        /// панель просит ввести в предупреждении на экране.
        [ChatCommand("ds")]
        private void CmdDiscord(BasePlayer player, string command, string[] args)
        {
            if (player == null) return;

            if (args == null || args.Length == 0)
            {
                SendReply(player, "Использование: /ds ваш_дискорд");
                return;
            }

            var discord = string.Join(" ", args).Trim();
            if (discord.Length > MaxDiscordLength) discord = discord.Substring(0, MaxDiscordLength);

            SendEvent("discord_linked", new Dictionary<string, object>
            {
                ["steamId"] = player.UserIDString,
                ["name"] = player.displayName,
                ["discord"] = discord
            });

            SendReply(player, "Дискорд принят: " + discord + ". Ожидайте модератора.");
        }

        #endregion

        #region Отправка

        private string BuildEventBody(string type, Dictionary<string, object> payload)
        {
            return JsonConvert.SerializeObject(new Dictionary<string, object>
            {
                ["serverId"] = _config.ServerId,
                ["type"] = type,
                ["timestamp"] = Now(),
                ["payload"] = payload
            });
        }

        private void SendEvent(string type, Dictionary<string, object> payload)
        {
            Enqueue("/api/ingest/event", BuildEventBody(type, payload), RequestMethod.POST, null);
        }

        private void Enqueue(string path, string body, RequestMethod method, Action<int, string> onSuccess)
        {
            if (_queue.Count >= MaxQueueSize)
            {
                _queue.RemoveFirst();
                _droppedSinceWarn++;
                if (_droppedSinceWarn == 1 || _droppedSinceWarn % 50 == 0)
                    PrintWarning("Очередь переполнена (" + MaxQueueSize + "), отброшено событий: " + _droppedSinceWarn);
            }

            _queue.AddLast(new PendingRequest
            {
                Path = path,
                Body = body,
                Method = method,
                Attempts = 0,
                NextAttemptAt = Time.realtimeSinceStartup,
                OnSuccess = onSuccess
            });
        }

        /// Разбирает очередь по одному запросу за тик — без параллельных отправок и без блокировок.
        private void ProcessQueue()
        {
            // Страховка от потерянного колбэка webrequest: через 30 секунд разблокируем очередь.
            if (_sending && Time.realtimeSinceStartup - _sendingStartedAt > 30f)
                _sending = false;

            if (_sending || _queue.Count == 0) return;

            var node = _queue.First;
            while (node != null && node.Value.NextAttemptAt > Time.realtimeSinceStartup)
                node = node.Next;

            if (node == null) return;

            var request = node.Value;
            _queue.Remove(node);
            _sending = true;
            _sendingStartedAt = Time.realtimeSinceStartup;

            SendNow(request.Path, request.Body, request.Method, (code, response) =>
            {
                _sending = false;

                if (code >= 200 && code < 300)
                {
                    request.OnSuccess?.Invoke(code, response);
                    return;
                }

                // Ретраим только сетевые сбои, 429 и 5xx. 4xx означает битый запрос — повтор не поможет.
                var retriable = code == 0 || code == 429 || code >= 500;
                if (!retriable)
                {
                    if (code == 401 || code == 403)
                        PrintError("Панель отклонила авторизацию (код " + code + "). Проверьте ServerKey/ServerSecret.");
                    return;
                }

                request.Attempts++;
                if (request.Attempts >= MaxAttempts)
                {
                    PrintWarning("Запрос " + request.Path + " отброшен после " + MaxAttempts + " попыток.");
                    return;
                }

                // Экспоненциальная задержка: 2, 4, 8, 16, 32 секунды.
                var delay = (float)Math.Pow(2, request.Attempts);
                request.NextAttemptAt = Time.realtimeSinceStartup + delay;
                _queue.AddFirst(request);
            });
        }

        private void SendNow(string path, string body, RequestMethod method, Action<int, string> callback)
        {
            var headers = BuildHeaders(body ?? "");

            webrequest.Enqueue(_config.ApiUrl + path, body, (code, response) =>
            {
                if (code >= 200 && code < 300)
                {
                    _lastSuccessAt = DateTime.UtcNow;
                    _panelDownReported = false;
                    _droppedSinceWarn = 0;
                }
                else if (!_panelDownReported
                         && (DateTime.UtcNow - _lastSuccessAt).TotalSeconds > PanelDownWarnSec)
                {
                    _panelDownReported = true;
                    PrintError("Панель недоступна дольше 2 минут (последний код " + code + ").");
                }

                callback?.Invoke(code, response);
            }, this, method, headers, 10f);
        }

        private Dictionary<string, string> BuildHeaders(string body)
        {
            var timestamp = Now().ToString(CultureInfo.InvariantCulture);

            return new Dictionary<string, string>
            {
                ["Content-Type"] = "application/json",
                ["X-Server-Key"] = _config.ServerKey,
                ["X-Timestamp"] = timestamp,
                ["X-Signature"] = HmacSha256Hex(body, _config.ServerSecret)
            };
        }

        #endregion

        #region Discord

        // Цвета совпадают с разделами панели: бан и репорт красные, снятие бана зелёное.
        private const int ColorBan = 0xef4444;
        private const int ColorReport = 0xef4444;
        private const int ColorUnban = 0x22c55e;

        /// Сколько держим отметку «это пришло командой из панели» — дольше, чем идёт
        /// путь «команда → banid → OnUserBanned», но достаточно коротко, чтобы
        /// ручной бан того же игрока минутой позже уже не считался панельным.
        private const double PanelBanMarkSec = 30;

        private class PanelAction
        {
            public string Admin;
            public DateTime At;
        }

        /// Ключ — «действие:SteamID». Отметку ставит команда из панели, снимает её
        /// хук сервера: так уведомление узнаёт автора, которого сам хук не приносит.
        private readonly Dictionary<string, PanelAction> _panelActions =
            new Dictionary<string, PanelAction>();

        /// Кэш адресов аватарок Steam: один и тот же игрок попадает в репорты пачками,
        /// а Steam не любит частых запросов за одним и тем же профилем.
        private readonly Dictionary<string, string> _avatarCache = new Dictionary<string, string>();

        /// Серый силуэт Steam — профиль скрыт, удалён или Steam не ответил.
        private const string DefaultAvatar =
            "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

        /// Символы, которые Discord считает разметкой, и знак экранирования перед ними.
        private const string MarkdownChars = "\\*_~`>|[]()";
        private const char EscapeChar = '\\';

        private class ReportTally
        {
            public int Count;
            public DateTime LastAt;
        }

        /// Сколько жалоб уже получил игрок. Счёт живёт в памяти плагина: панель считает
        /// то же самое у себя, но по своей базе и молча — а число нужно прямо здесь,
        /// в момент отправки сообщения.
        private readonly Dictionary<string, ReportTally> _reportTally =
            new Dictionary<string, ReportTally>();

        /// Подпись сервера в сообщении: имя из конфига, иначе hostname.
        private string DiscordServerName()
        {
            var name = _config.Discord.ServerName;
            return string.IsNullOrEmpty(name) ? ConVar.Server.hostname : name;
        }

        private static object DiscordField(string name, string value, bool inline)
        {
            return new Dictionary<string, object>
            {
                ["name"] = name,
                // У Discord жёсткий предел на поле — режем, иначе он отвергнет всё сообщение.
                // Пустое значение он отвергает так же, как слишком длинное, поэтому нужен прочерк.
                ["value"] = Trim(string.IsNullOrEmpty(value) ? "—" : value, 1024),
                ["inline"] = inline
            };
        }

        /// Который это по счёту репорт на игрока. Заодно выкидываем протухшие записи:
        /// иначе словарь рос бы с каждым новым именем до перезагрузки плагина.
        private int BumpReportTally(string targetId)
        {
            if (string.IsNullOrEmpty(targetId)) return 1;

            var window = Math.Max(1, _config.Discord.ReportCountWindowHours);
            var now = DateTime.UtcNow;

            foreach (var pair in _reportTally.ToList())
            {
                if ((now - pair.Value.LastAt).TotalHours >= window) _reportTally.Remove(pair.Key);
            }

            ReportTally tally;
            if (!_reportTally.TryGetValue(targetId, out tally))
            {
                tally = new ReportTally();
                _reportTally[targetId] = tally;
            }

            tally.Count++;
            tally.LastAt = now;
            return tally.Count;
        }

        /// Ник игрока Discord читает как разметку: звёздочки, подчёркивания и скобки
        /// в нём ломают и текст, и ссылку на профиль. Экранируем всё, что он считает своим.
        private static string EscapeMarkdown(string value)
        {
            if (string.IsNullOrEmpty(value)) return value;

            var result = new StringBuilder(value.Length + 8);
            foreach (var c in value)
            {
                if (MarkdownChars.IndexOf(c) >= 0) result.Append(EscapeChar);
                result.Append(c);
            }

            return result.ToString();
        }

        /// Адрес аватарки для сообщения. Ключ Steam API не нужен: картинка указана
        /// в публичном XML профиля. На ошибку отдаём серый силуэт, но в кэш его
        /// не кладём — иначе разовый сбой Steam запомнился бы навсегда.
        private void FetchSteamAvatar(string steamId, Action<string> onDone)
        {
            if (!_config.Discord.ShowAvatars || !IsSteamId(steamId))
            {
                onDone(null);
                return;
            }

            string cached;
            if (_avatarCache.TryGetValue(steamId, out cached))
            {
                onDone(cached);
                return;
            }

            webrequest.Enqueue("https://steamcommunity.com/profiles/" + steamId + "?xml=1", null,
                (code, response) =>
                {
                    var url = code >= 200 && code < 300 ? ParseSteamAvatar(response) : null;

                    if (!string.IsNullOrEmpty(url))
                    {
                        // Кэш чистим целиком: аватарки меняются редко, точность тут не важна.
                        if (_avatarCache.Count >= 512) _avatarCache.Clear();
                        _avatarCache[steamId] = url;
                    }

                    onDone(string.IsNullOrEmpty(url) ? DefaultAvatar : url);
                }, this, RequestMethod.GET, null, 10f);
        }

        /// Адрес из тега avatarFull. Разбираем строкой: XML-парсер ради одного тега
        /// тянуть незачем, а формат ответа Steam не меняет годами.
        private static string ParseSteamAvatar(string xml)
        {
            if (string.IsNullOrEmpty(xml)) return null;

            const string tag = "<avatarFull>";
            var start = xml.IndexOf(tag, StringComparison.OrdinalIgnoreCase);
            if (start < 0) return null;
            start += tag.Length;

            var end = xml.IndexOf("</avatarFull>", start, StringComparison.OrdinalIgnoreCase);
            if (end < 0) return null;

            var url = xml.Substring(start, end - start)
                .Replace("<![CDATA[", "")
                .Replace("]]>", "")
                .Trim();

            return url.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ? url : null;
        }

        private void MarkPanelAction(string kind, string steamId, string admin)
        {
            if (string.IsNullOrEmpty(steamId)) return;
            _panelActions[kind + ":" + steamId] = new PanelAction { Admin = admin, At = DateTime.UtcNow };
        }

        /// Действие только что пришло командой из панели? Тогда отдаёт и логин
        /// сотрудника. Заодно чистим протухшие отметки: отметка одноразовая,
        /// следующий бан того же игрока считается новым.
        private bool TakePanelAction(string kind, string steamId, out string admin)
        {
            admin = null;
            if (string.IsNullOrEmpty(steamId)) return false;

            var stale = _panelActions
                .Where(pair => (DateTime.UtcNow - pair.Value.At).TotalSeconds > PanelBanMarkSec)
                .Select(pair => pair.Key)
                .ToList();
            foreach (var key in stale) _panelActions.Remove(key);

            var mark = kind + ":" + steamId;

            PanelAction action;
            if (!_panelActions.TryGetValue(mark, out action)) return false;

            _panelActions.Remove(mark);
            // Панель старше 1.5.0 логина не присылает — подписываем такое сообщение ею самой.
            admin = string.IsNullOrEmpty(action.Admin) ? "Панель" : action.Admin;
            return true;
        }

        /// Сообщение в Discord — напрямую с игрового сервера, мимо панели и мимо её очереди.
        ///
        /// Очередь панели тут не годится: у неё свой хост, подпись HMAC ключами сервера
        /// и ретраи, а Discord ничего этого не понимает. Недоставленное сообщение просто
        /// теряется с предупреждением в консоли: уведомление не повод копить очередь.
        private void PostToDiscord(string webhookUrl, string title, int color, List<object> fields,
            Action<int, string> onDone = null)
        {
            PostToDiscord(webhookUrl, new Dictionary<string, object>
            {
                ["title"] = title,
                ["color"] = color,
                ["fields"] = fields,
                ["footer"] = new Dictionary<string, object> { ["text"] = "YnaziCotTV" },
                ["timestamp"] = DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture)
            }, null, onDone);
        }

        /// Тот же путь, но с готовым embed: сообщение о репорте собирает его само —
        /// с картинкой профиля, подписью жалобщика и упоминанием (content) над embed.
        private void PostToDiscord(string webhookUrl, Dictionary<string, object> embed, string content,
            Action<int, string> onDone = null)
        {
            if (string.IsNullOrEmpty(webhookUrl)) return;

            if (!webhookUrl.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
                || webhookUrl.IndexOf("/api/webhooks/", StringComparison.OrdinalIgnoreCase) < 0)
            {
                PrintWarning("Discord: адрес вебхука не похож на настоящий, сообщение не отправлено. "
                             + "Скопируйте URL в настройках канала: Интеграции → Вебхуки.");
                return;
            }

            var payload = new Dictionary<string, object>
            {
                ["username"] = "YnaziCotTV",
                ["embeds"] = new List<object> { embed }
            };

            if (!string.IsNullOrEmpty(content))
            {
                payload["content"] = content;
                // Без явного разрешения Discord показал бы @everyone из вебхука обычным текстом.
                payload["allowed_mentions"] = new Dictionary<string, object>
                {
                    ["parse"] = new List<string> { "everyone" }
                };
            }

            var body = JsonConvert.SerializeObject(payload);

            var headers = new Dictionary<string, string> { ["Content-Type"] = "application/json" };

            webrequest.Enqueue(webhookUrl, body, (code, response) =>
            {
                // Проверка вебхука ждёт ответа в любом случае — даже успешного, о котором
                // обычная отправка молчит.
                if (onDone != null) onDone(code, response);

                // Вебхук отвечает 204 без тела; всё остальное стоит показать администратору.
                if (code >= 200 && code < 300) return;

                if (code == 401 || code == 403 || code == 404)
                    PrintWarning("Discord: вебхука больше нет (код " + code
                                 + "). Создайте его заново в настройках канала и впишите новый адрес в конфиг.");
                else if (code == 429)
                    PrintWarning("Discord: слишком часто (429), сообщение придержано.");
                else if (code == 0)
                    PrintWarning("Discord: нет ответа. С этого сервера не открывается discord.com — "
                                 + "проверьте блокировки и фаервол.");
                else
                    PrintWarning("Discord: код " + code + ". " + Trim(response ?? "", 200));
            }, this, RequestMethod.POST, headers, 10f);
        }

        #endregion

        #region Утилиты

        private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeSeconds();

        private static string StripPort(string address)
        {
            if (string.IsNullOrEmpty(address)) return "";
            var index = address.LastIndexOf(':');
            return index > 0 ? address.Substring(0, index) : address;
        }

        /// Валидный SteamID64 обычного аккаунта: пиратские клиенты приходят с ID вне этого диапазона.
        private static bool IsLicensedSteamId(ulong steamId)
        {
            return steamId >= 76561197960265728UL && steamId <= 76561202255233023UL;
        }

        /// Очередь на вход: joining — кто уже подключается, остальные ждут.
        private static int GetQueueCount(bool joining)
        {
            try
            {
                var queue = ServerMgr.Instance?.connectionQueue;
                if (queue == null) return 0;
                return joining ? queue.Joining : queue.Queued;
            }
            catch
            {
                return 0;
            }
        }

        /// Размер команды из RelationshipManager. Без команды игрок считается соло.
        private static int GetTeamSize(BasePlayer player)
        {
            try
            {
                if (player.currentTeam == 0UL) return 1;

                var team = RelationshipManager.ServerInstance?.FindTeam(player.currentTeam);
                var count = team?.members?.Count ?? 0;
                return count < 1 ? 1 : count;
            }
            catch
            {
                return 1;
            }
        }

        /// Язык клиента по данным Oxide ("ru", "en", …).
        private string GetLanguage(BasePlayer player)
        {
            try
            {
                return lang.GetLanguage(player.UserIDString) ?? "";
            }
            catch
            {
                return "";
            }
        }

        private static int GetPing(BasePlayer player)
        {
            try
            {
                return player?.net?.connection != null
                    ? Network.Net.sv.GetAveragePing(player.net.connection)
                    : 0;
            }
            catch
            {
                return 0;
            }
        }

        private void CacheConnection(BasePlayer player)
        {
            if (player == null || _connections.ContainsKey(player.userID)) return;

            var connection = player.net?.connection;
            _connections[player.userID] = new ConnectionInfo
            {
                OwnerId = connection?.ownerid ?? player.userID,
                Ip = StripPort(connection?.ipaddress),
                AuthLevel = connection != null ? (int)connection.authLevel : 0,
                Licensed = IsLicensedSteamId(player.userID),
                FamilyShare = connection != null && connection.ownerid != 0UL && connection.ownerid != player.userID,
                ConnectedAt = DateTime.UtcNow
            };
        }

        private ConnectionInfo GetConnection(BasePlayer player)
        {
            ConnectionInfo info;
            if (_connections.TryGetValue(player.userID, out info)) return info;

            CacheConnection(player);
            return _connections.TryGetValue(player.userID, out info)
                ? info
                : new ConnectionInfo { Ip = "", ConnectedAt = DateTime.UtcNow, Licensed = IsLicensedSteamId(player.userID) };
        }

        private static string HmacSha256Hex(string body, string secret)
        {
            using (var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(secret ?? "")))
            {
                var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(body ?? ""));
                return ToHex(hash);
            }
        }

        private static string Sha256Hex(byte[] data)
        {
            using (var sha = SHA256.Create())
            {
                return ToHex(sha.ComputeHash(data));
            }
        }

        private static string ToHex(byte[] bytes)
        {
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2", CultureInfo.InvariantCulture));
            return sb.ToString();
        }

        #endregion
    }
}
