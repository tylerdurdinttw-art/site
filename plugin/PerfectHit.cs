using System;
using System.Collections.Generic;
using Newtonsoft.Json;
using UnityEngine;

namespace Oxide.Plugins
{
    [Info("PerfectHit", "QuickRust", "1.0.0")]
    [Description("Удар по дереву всегда попадает в крестик, по камню — в светящуюся точку, куда бы игрок ни бил")]
    public class PerfectHit : RustPlugin
    {
        #region Поля

        private const string PermUse = "perfecthit.use";

        // Хуки возвращают object: заранее упакованный true, чтобы не аллоцировать на каждом ударе.
        private static readonly object BoxedTrue = true;

        // Насколько близко к центру светящейся точки переносим удар, в метрах.
        private const float HotSpotOffset = 0.01f;

        private PluginConfig _config;

        // Кеш результата проверки пермишена по SteamID. Проверка в Oxide идёт по строке и группам,
        // а удар по ресурсу — самое частое событие на сервере, поэтому считаем один раз.
        private readonly Dictionary<ulong, bool> _permCache = new Dictionary<ulong, bool>();

        #endregion

        #region Конфиг

        private class PluginConfig
        {
            [JsonProperty("Деревья: всегда попадать в крестик")]
            public bool Trees { get; set; } = true;

            [JsonProperty("Камни: всегда попадать в светящуюся точку")]
            public bool Ores { get; set; } = true;

            [JsonProperty("Только для игроков с пермишеном perfecthit.use")]
            public bool UsePermission { get; set; } = false;
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

        #region Инициализация

        private void Init()
        {
            permission.RegisterPermission(PermUse, this);

            // Выключенные функции не должны стоить ничего: Oxide просто не будет вызывать эти хуки.
            if (!_config.Trees) Unsubscribe(nameof(OnTreeMarkerHit));
            if (!_config.Ores) Unsubscribe(nameof(OnPlayerAttack));

            if (!_config.UsePermission)
            {
                Unsubscribe(nameof(OnPlayerDisconnected));
                Unsubscribe(nameof(OnUserPermissionGranted));
                Unsubscribe(nameof(OnUserPermissionRevoked));
                Unsubscribe(nameof(OnGroupPermissionGranted));
                Unsubscribe(nameof(OnGroupPermissionRevoked));
                Unsubscribe(nameof(OnUserGroupAdded));
                Unsubscribe(nameof(OnUserGroupRemoved));
                Unsubscribe(nameof(OnGroupParentSet));
            }
        }

        #endregion

        #region Деревья

        // Вызывается из TreeEntity.DidHitMarker только когда крестик уже висит на дереве.
        // true = игра считает, что удар пришёлся в крестик: бонус к добыче растёт,
        // новый крестик спавнится рядом со старым, как при честном попадании.
        private object OnTreeMarkerHit(TreeEntity tree, HitInfo info)
        {
            if (!_config.UsePermission) return BoxedTrue;
            return HasAccess(info?.InitiatorPlayer) ? BoxedTrue : null;
        }

        #endregion

        #region Камни

        // Для руды отдельного хука нет. OnPlayerAttack из BaseMelee.DoAttackShared срабатывает
        // уже после серверных проверок удара, но до OreResourceEntity.OnAttacked, где игра сравнивает
        // точку попадания с позицией светящейся точки. Переносим точку попадания в неё — проверка проходит.
        private object OnPlayerAttack(BasePlayer attacker, HitInfo info)
        {
            // Хук вызывается на каждый выстрел и удар на сервере, поэтому сначала самые дешёвые отсечки.
            if (info == null || info.ProjectileID != 0) return null;

            var ore = info.HitEntity as OreResourceEntity;
            if (ore == null) return null;

            var hotSpot = ore._hotSpot;
            if (hotSpot == null) return null;

            if (_config.UsePermission && !HasAccess(attacker)) return null;

            // Ровно в центр точки удар не ставим: игра считает направления от точки попадания
            // к светящейся точке, и при полном совпадении вектор выходит нулевым — Unity начинает
            // сыпать в консоль "Look rotation viewing vector is zero". Сантиметр в сторону
            // настоящего удара радиус попадания не ломает, а нулевого вектора больше нет.
            Vector3 offset = info.HitPositionWorld - hotSpot.transform.position;
            float sqrDist = offset.sqrMagnitude;

            // Игрок и так попал в точку — переносить нечего.
            if (sqrDist <= HotSpotOffset * HotSpotOffset) return null;

            info.HitPositionWorld = hotSpot.transform.position + offset * (HotSpotOffset / Mathf.Sqrt(sqrDist));
            return null;
        }

        #endregion

        #region Пермишен

        private bool HasAccess(BasePlayer player)
        {
            if (player == null) return false;

            ulong id = player.userID;
            bool allowed;
            if (!_permCache.TryGetValue(id, out allowed))
            {
                allowed = permission.UserHasPermission(player.UserIDString, PermUse);
                _permCache[id] = allowed;
            }

            return allowed;
        }

        private void OnPlayerDisconnected(BasePlayer player, string reason) => _permCache.Remove(player.userID);

        // Права меняются редко, поэтому при любом изменении просто сбрасываем весь кеш.
        // Имя пермишена не сравниваем: его могут выдать и маской вроде perfecthit.*
        private void OnUserPermissionGranted(string id, string perm) => _permCache.Clear();

        private void OnUserPermissionRevoked(string id, string perm) => _permCache.Clear();

        private void OnGroupPermissionGranted(string group, string perm) => _permCache.Clear();

        private void OnGroupPermissionRevoked(string group, string perm) => _permCache.Clear();

        private void OnUserGroupAdded(string id, string group) => _permCache.Clear();

        private void OnUserGroupRemoved(string id, string group) => _permCache.Clear();

        private void OnGroupParentSet(string group, string parent) => _permCache.Clear();

        #endregion
    }
}
