using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Oxide.Core;
using Oxide.Core.Libraries.Covalence;
using Oxide.Core.Plugins;
using Oxide.Game.Rust.Cui;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

namespace Oxide.Plugins
{
    [Info("GameStoresMenu", "ynazi", "1.0.0")]
    [Description("Магазин сервера: витрина товаров и вкладка выданных предметов в стиле GameStores")]
    public class GameStoresMenu : RustPlugin
    {
        #region Fields

        [PluginReference] private Plugin ImageLibrary, Economics, ServerRewards;

        private static GameStoresMenu Instance;

        private const string PermAdmin = "gamestoresmenu.admin";

        private const int TabStore = 0, TabBasket = 1;

        private readonly Dictionary<ulong, int> _tabs = new Dictionary<ulong, int>();
        private readonly Dictionary<ulong, double> _balances = new Dictionary<ulong, double>();
        private readonly Dictionary<ulong, List<BasketItem>> _remoteBaskets = new Dictionary<ulong, List<BasketItem>>();
        private readonly HashSet<ulong> _remoteLoading = new HashSet<ulong>();
        private readonly Dictionary<ulong, float> _cooldowns = new Dictionary<ulong, float>();

        private readonly List<Coroutine> _coroutines = new List<Coroutine>();

        private Timer _saveTimer;

        #endregion

        #region Configuration

        private Configuration _config;

        private class Configuration
        {
            [JsonProperty("Команды открытия меню", ObjectCreationHandling = ObjectCreationHandling.Replace)]
            public string[] Commands = { "shop", "магазин" };

            [JsonProperty("Ссылка на магазин (выводится в чат по кнопке «+»)")]
            public string ShopURL = "https://ваш-магазин.ru";

            [JsonProperty("Название валюты (текст после цены, можно оставить пустым)")]
            public string CurrencyName = "₽";

            [JsonProperty("Иконка валюты (ссылка на картинку / спрайт / shortname предмета, пусто — только текст)")]
            public string CurrencyIcon = "";

            [JsonProperty("Источник баланса (Internal / Economics / ServerRewards / GameStores)")]
            public string BalanceSource = "Internal";

            [JsonProperty("Стартовый баланс (только для Internal)")]
            public int StartBalance = 0;

            [JsonProperty("Спрашивать подтверждение покупки")]
            public bool BuyConfirmation = true;

            [JsonProperty("Запретить забирать товары в зоне блокировки строительства")]
            public bool BlockBuildingBlocked = false;

            [JsonProperty("Логировать покупки в файл")]
            public bool LogPurchases = true;

            [JsonProperty("Интеграция с GameStores")]
            public GameStoresConfig GameStores = new GameStoresConfig();

            [JsonProperty("Настройки интерфейса")]
            public InterfaceConfig UI = new InterfaceConfig();

            [JsonProperty("Товары")]
            public List<ProductConfig> Products = new List<ProductConfig>();

            public class GameStoresConfig
            {
                [JsonProperty("Включить (товары, купленные на сайте, попадают во вкладку «Ваши предметы»)")]
                public bool Enabled = false;

                [JsonProperty("ИД магазина в сервисе")]
                public string ShopID = "UNDEFINED";

                [JsonProperty("ИД сервера в сервисе")]
                public string ServerID = "UNDEFINED";

                [JsonProperty("Секретный ключ (не распространяйте его)")]
                public string SecretKey = "UNDEFINED";

                [JsonProperty("Адрес API")]
                public string ApiLink = "https://api.gamestores.app/v1/";
            }

            public class InterfaceConfig
            {
                [JsonProperty("Ширина меню")] public float Width = 1010f;

                [JsonProperty("Высота меню")] public float Height = 630f;

                [JsonProperty("Товаров в строке")] public int ItemsOnString = 5;

                [JsonProperty("Высота карточки товара")] public float CardHeight = 236f;

                [JsonProperty("Отступ между карточками")] public float CardMargin = 6f;

                [JsonProperty("Иконка вкладки «Магазин» (ссылка / спрайт / shortname предмета)")]
                public string StoreIcon = "vending.machine";

                [JsonProperty("Иконка вкладки «Ваши предметы» (ссылка / спрайт / shortname предмета)")]
                public string BasketIcon = "box.wooden";

                [JsonProperty("Размытие фона")] public bool Blur = true;

                [JsonProperty("Цвет затемнения экрана")]
                public UiColor Background = UiColor.Create("#000000", 70);

                [JsonProperty("Цвет фона меню")] public UiColor Menu = UiColor.Create("#0D0D0D", 100);

                [JsonProperty("Цвет панелей (поля, строки)")]
                public UiColor Panel = UiColor.Create("#191919", 100);

                [JsonProperty("Цвет левой панели")] public UiColor Sidebar = UiColor.Create("#141414", 100);

                [JsonProperty("Цвет карточки товара")] public UiColor Card = UiColor.Create("#191919", 100);

                [JsonProperty("Цвет подложки названия товара")]
                public UiColor CardFooter = UiColor.Create("#151515", 100);

                [JsonProperty("Акцентный цвет (кнопки, активная вкладка)")]
                public UiColor Accent = UiColor.Create("#D14A21", 100);

                [JsonProperty("Цвет ника")] public UiColor Nick = UiColor.Create("#E04A22", 100);

                [JsonProperty("Цвет цены")] public UiColor Price = UiColor.Create("#E5562C", 100);

                [JsonProperty("Цвет основного текста")] public UiColor Text = UiColor.Create("#B7B7B7", 100);

                [JsonProperty("Цвет второстепенного текста")]
                public UiColor TextSecondary = UiColor.Create("#8A8A8A", 100);

                [JsonProperty("Цвет иконки неактивной вкладки")]
                public UiColor InactiveIcon = UiColor.Create("#7D7D7D", 100);
            }

            public class ProductConfig
            {
                [JsonProperty("ID товара (уникальный)")] public string Id = "";

                [JsonProperty("Ссылка на фото")] public string Image = "";

                [JsonProperty("Название товара")] public string Name = "";

                [JsonProperty("Цена")] public int Price = 0;

                [JsonProperty("Количество")] public int Amount = 1;

                [JsonProperty("Количество в наличии (-1 — бесконечно)")]
                public int Stock = -1;

                [JsonProperty("Скидка в % (0 — не показывать)")]
                public int Discount = 0;

                [JsonProperty("Тип выдачи (item / blueprint / command)")]
                public string Type = "item";

                [JsonProperty("Shortname предмета (для item / blueprint)")]
                public string Shortname = "";

                [JsonProperty("SkinID предмета")] public ulong SkinID = 0;

                [JsonProperty("Команды (%steamid%, %username%)", ObjectCreationHandling = ObjectCreationHandling.Replace)]
                public List<string> Commands = new List<string>();

                [JsonProperty("Выдавать сразу в инвентарь (минуя вкладку «Ваши предметы»)")]
                public bool GiveInstantly = false;

                [JsonProperty("Право для покупки (пусто — доступно всем)")]
                public string Permission = "";

                [JsonIgnore] public bool IsCommand => string.Equals(Type, "command", StringComparison.OrdinalIgnoreCase);

                [JsonIgnore] public bool IsBlueprint => string.Equals(Type, "blueprint", StringComparison.OrdinalIgnoreCase) ||
                                                        string.Equals(Type, "bp", StringComparison.OrdinalIgnoreCase);

                [JsonIgnore] public bool IsItem => !IsCommand && !IsBlueprint;
            }

            public class UiColor
            {
                [JsonProperty("HEX")] public string Hex = "#FFFFFF";

                [JsonProperty("Прозрачность (0 - 100)")] public float Alpha = 100f;

                [JsonIgnore] private string _color;

                [JsonIgnore]
                public string Get
                {
                    get
                    {
                        if (string.IsNullOrEmpty(_color))
                            _color = ToRustFormat(Hex, Alpha);

                        return _color;
                    }
                }

                public static UiColor Create(string hex, float alpha = 100f)
                {
                    return new UiColor { Hex = hex, Alpha = alpha };
                }

                private static string ToRustFormat(string hex, float alpha)
                {
                    if (string.IsNullOrEmpty(hex)) hex = "#FFFFFF";

                    var str = hex.Replace("#", string.Empty);
                    if (str.Length != 6) str = "FFFFFF";

                    var r = byte.Parse(str.Substring(0, 2), NumberStyles.HexNumber);
                    var g = byte.Parse(str.Substring(2, 2), NumberStyles.HexNumber);
                    var b = byte.Parse(str.Substring(4, 2), NumberStyles.HexNumber);

                    return string.Format(CultureInfo.InvariantCulture, "{0} {1} {2} {3}",
                        (double)r / 255, (double)g / 255, (double)b / 255, alpha / 100);
                }
            }
        }

        protected override void LoadDefaultConfig()
        {
            _config = new Configuration();
            _config.Products = GetDefaultProducts();
        }

        private List<Configuration.ProductConfig> GetDefaultProducts()
        {
            return new List<Configuration.ProductConfig>
            {
                new Configuration.ProductConfig
                {
                    Id = "premium",
                    Image = "",
                    Name = "WEEKLY PREMIUM STATUS",
                    Price = 685,
                    Amount = 1,
                    Stock = 4,
                    Discount = 35,
                    Type = "command",
                    Commands = new List<string> { "oxide.usergroup add %steamid% premium 7d" },
                    GiveInstantly = false
                },
                new Configuration.ProductConfig
                {
                    Id = "vip",
                    Image = "",
                    Name = "WEEKLY VIP STATUS",
                    Price = 295,
                    Amount = 1,
                    Stock = -1,
                    Discount = 0,
                    Type = "command",
                    Commands = new List<string> { "oxide.usergroup add %steamid% vip 7d" },
                    GiveInstantly = false
                },
                new Configuration.ProductConfig
                {
                    Id = "starter_kit",
                    Image = "",
                    Name = "Набор новичка",
                    Price = 450,
                    Amount = 1,
                    Stock = -1,
                    Discount = 0,
                    Type = "item",
                    Shortname = "scrap",
                    GiveInstantly = false
                },
                new Configuration.ProductConfig
                {
                    Id = "ak47",
                    Image = "",
                    Name = "Автомат AK-47",
                    Price = 750,
                    Amount = 1,
                    Stock = 8,
                    Discount = 10,
                    Type = "item",
                    Shortname = "rifle.ak",
                    GiveInstantly = false
                },
                new Configuration.ProductConfig
                {
                    Id = "bp_ak47",
                    Image = "",
                    Name = "Чертёж AK-47",
                    Price = 638,
                    Amount = 1,
                    Stock = -1,
                    Discount = 15,
                    Type = "blueprint",
                    Shortname = "rifle.ak",
                    GiveInstantly = false
                }
            };
        }

        protected override void LoadConfig()
        {
            base.LoadConfig();

            try
            {
                _config = Config.ReadObject<Configuration>();
                if (_config == null) throw new JsonException();

                if (_config.Products == null || _config.Products.Count == 0)
                    _config.Products = GetDefaultProducts();
            }
            catch (Exception e)
            {
                PrintError($"Конфигурация повреждена, создана новая! ({e.Message})");
                LoadDefaultConfig();
            }

            NextTick(SaveConfig);
        }

        protected override void SaveConfig()
        {
            Config.WriteObject(_config);
        }

        #endregion

        #region Data

        private PluginData _data = new PluginData();

        private class PluginData
        {
            [JsonProperty("Игроки")]
            public Dictionary<ulong, PlayerInfo> Players = new Dictionary<ulong, PlayerInfo>();

            [JsonProperty("Остаток товаров")]
            public Dictionary<string, int> Stock = new Dictionary<string, int>();

            [JsonProperty("Последний ID предмета")]
            public int LastItemId;
        }

        private class PlayerInfo
        {
            [JsonProperty("Баланс")] public double Balance;

            [JsonProperty("Предметы")] public List<BasketItem> Items = new List<BasketItem>();
        }

        private class BasketItem
        {
            [JsonProperty("ID")] public int Id;

            [JsonProperty("ID товара")] public string ProductId = string.Empty;

            [JsonProperty("Название")] public string Name = string.Empty;

            [JsonProperty("Фото")] public string Image = string.Empty;

            [JsonProperty("Количество")] public int Amount = 1;

            [JsonProperty("Тип")] public string Type = "item";

            [JsonProperty("Shortname")] public string Shortname = string.Empty;

            [JsonProperty("SkinID")] public ulong SkinID;

            [JsonProperty("Команды")] public List<string> Commands = new List<string>();

            [JsonProperty("Время покупки")] public double Time;

            [JsonProperty("Источник")] public string Source = SourcePlugin;

            [JsonProperty("ID в GameStores")] public string RemoteId = string.Empty;

            [JsonIgnore] public bool IsRemote => Source == SourceGameStores;

            [JsonIgnore] public bool IsCommand => string.Equals(Type, "command", StringComparison.OrdinalIgnoreCase);

            [JsonIgnore] public bool IsBlueprint => string.Equals(Type, "blueprint", StringComparison.OrdinalIgnoreCase) ||
                                                    string.Equals(Type, "bp", StringComparison.OrdinalIgnoreCase);
        }

        private const string SourcePlugin = "plugin", SourceGameStores = "gamestores";

        private void LoadData()
        {
            try
            {
                _data = Interface.Oxide.DataFileSystem.ReadObject<PluginData>(Name);
            }
            catch (Exception e)
            {
                PrintError($"Файл данных повреждён, создан новый! ({e.Message})");
                _data = null;
            }

            if (_data == null) _data = new PluginData();
            if (_data.Players == null) _data.Players = new Dictionary<ulong, PlayerInfo>();
            if (_data.Stock == null) _data.Stock = new Dictionary<string, int>();
        }

        private void SaveData()
        {
            Interface.Oxide.DataFileSystem.WriteObject(Name, _data);
        }

        private PlayerInfo GetPlayerInfo(ulong userId)
        {
            PlayerInfo info;
            if (!_data.Players.TryGetValue(userId, out info))
            {
                info = new PlayerInfo { Balance = _config.StartBalance };
                _data.Players[userId] = info;
            }

            if (info.Items == null) info.Items = new List<BasketItem>();

            return info;
        }

        private void SyncStock()
        {
            foreach (var product in _config.Products)
            {
                if (string.IsNullOrEmpty(product.Id)) continue;

                if (product.Stock < 0)
                {
                    _data.Stock.Remove(product.Id);
                    continue;
                }

                if (!_data.Stock.ContainsKey(product.Id))
                    _data.Stock[product.Id] = product.Stock;
            }
        }

        private int GetStock(Configuration.ProductConfig product)
        {
            if (product.Stock < 0) return -1;

            int left;
            return _data.Stock.TryGetValue(product.Id, out left) ? left : product.Stock;
        }

        #endregion

        #region Hooks

        private void Init()
        {
            Instance = this;

            permission.RegisterPermission(PermAdmin, this);

            LoadData();
        }

        private void OnServerInitialized()
        {
            SyncStock();

            foreach (var product in _config.Products)
            {
                if (string.IsNullOrEmpty(product.Id))
                    PrintWarning($"У товара «{product.Name}» не указан ID — он не будет работать!");

                if (!string.IsNullOrEmpty(product.Permission) && !permission.PermissionExists(product.Permission))
                    permission.RegisterPermission(product.Permission, this);
            }

            AddCovalenceCommand(_config.Commands, nameof(CmdChatShop));

            LoadImages();

            _saveTimer = timer.Every(300f, SaveData);

            if (_config.GameStores.Enabled && _config.GameStores.SecretKey == "UNDEFINED")
                PrintError("Интеграция с GameStores включена, но не заполнены ИД магазина / сервера / секретный ключ!");
        }

        private void Unload()
        {
            try
            {
                if (_saveTimer != null) _saveTimer.Destroy();

                foreach (var player in BasePlayer.activePlayerList)
                    CuiHelper.DestroyUi(player, Layer);

                foreach (var coroutine in _coroutines)
                    if (coroutine != null)
                        ServerMgr.Instance.StopCoroutine(coroutine);

                _coroutines.Clear();

                SaveData();
            }
            finally
            {
                Instance = null;
            }
        }

        private void OnServerSave()
        {
            SaveData();
        }

        private void OnPluginLoaded(Plugin plugin)
        {
            if (plugin != null && plugin.Name == "ImageLibrary")
                timer.In(2f, LoadImages);
        }

        private void OnPlayerDisconnected(BasePlayer player)
        {
            if (player == null) return;

            _tabs.Remove(player.userID);
            _balances.Remove(player.userID);
            _remoteBaskets.Remove(player.userID);
            _remoteLoading.Remove(player.userID);
            _cooldowns.Remove(player.userID);
        }

        #endregion

        #region Commands

        private void CmdChatShop(IPlayer covPlayer, string command, string[] args)
        {
            var player = covPlayer?.Object as BasePlayer;
            if (player == null || player.IsSleeping()) return;

            OpenMenu(player, TabStore);
        }

        [ConsoleCommand("UI_ShopMenu")]
        private void CmdConsoleShop(ConsoleSystem.Arg args)
        {
            var player = args.Player();
            if (player == null || !args.HasArgs()) return;

            var action = args.GetString(0);

            if (IsAction(action, "tab"))
            {
                OpenMenu(player, args.GetInt(1, TabStore), false);
                return;
            }

            if (IsAction(action, "buy"))
            {
                if (!args.HasArgs(2) || IsOnCooldown(player)) return;

                TryBuy(player, args.GetString(1), false);
                return;
            }

            if (IsAction(action, "buyconfirm"))
            {
                if (!args.HasArgs(2) || IsOnCooldown(player)) return;

                CuiHelper.DestroyUi(player, LayerModal);

                TryBuy(player, args.GetString(1), true);
                return;
            }

            if (IsAction(action, "take"))
            {
                if (!args.HasArgs(2) || IsOnCooldown(player)) return;

                TryTake(player, args.GetString(1));
                return;
            }

            if (IsAction(action, "topup"))
            {
                Reply(player, MsgTopUp, _config.ShopURL);
                return;
            }

            if (IsAction(action, "close"))
            {
                _tabs.Remove(player.userID);

                CuiHelper.DestroyUi(player, Layer);
                return;
            }

            if (IsAction(action, "closemodal"))
                CuiHelper.DestroyUi(player, LayerModal);
        }

        private static bool IsAction(string value, string action)
        {
            return string.Equals(value, action, StringComparison.OrdinalIgnoreCase);
        }

        [ConsoleCommand("shopmenu.balance")]
        private void CmdConsoleBalance(ConsoleSystem.Arg args)
        {
            if (!HasAdminAccess(args)) return;

            if (!args.HasArgs(2))
            {
                SendReplyArg(args, "Использование: shopmenu.balance <steamid> <кол-во>");
                return;
            }

            var targetId = args.GetUInt64(0, 0UL);
            var amount = args.GetInt(1, 0);

            if (!targetId.IsSteamId())
            {
                SendReplyArg(args, "Некорректный SteamID!");
                return;
            }

            Deposit(targetId, amount, success =>
            {
                SendReplyArg(args, success
                    ? $"Баланс игрока {targetId} изменён на {amount}"
                    : $"Не удалось изменить баланс игрока {targetId}");

                var target = BasePlayer.FindByID(targetId);
                if (target != null) RefreshBalance(target);
            });
        }

        [ConsoleCommand("shopmenu.give")]
        private void CmdConsoleGive(ConsoleSystem.Arg args)
        {
            if (!HasAdminAccess(args)) return;

            if (!args.HasArgs(2))
            {
                SendReplyArg(args, "Использование: shopmenu.give <steamid> <ID товара>");
                return;
            }

            var targetId = args.GetUInt64(0, 0UL);
            var productId = args.GetString(1);

            var product = FindProduct(productId);
            if (product == null)
            {
                SendReplyArg(args, $"Товар «{productId}» не найден!");
                return;
            }

            if (!targetId.IsSteamId())
            {
                SendReplyArg(args, "Некорректный SteamID!");
                return;
            }

            AddToBasket(targetId, product);

            SendReplyArg(args, $"Товар «{product.Name}» выдан игроку {targetId}");

            var target = BasePlayer.FindByID(targetId);
            if (target != null && IsMenuOpen(target)) OpenMenu(target, GetTab(target), false);
        }

        [ConsoleCommand("shopmenu.resetstock")]
        private void CmdConsoleResetStock(ConsoleSystem.Arg args)
        {
            if (!HasAdminAccess(args)) return;

            _data.Stock.Clear();
            SyncStock();
            SaveData();

            SendReplyArg(args, "Остатки товаров сброшены до значений из конфигурации");
        }

        private bool HasAdminAccess(ConsoleSystem.Arg args)
        {
            var player = args.Player();

            return player == null || permission.UserHasPermission(player.UserIDString, PermAdmin) || player.IsAdmin;
        }

        private void SendReplyArg(ConsoleSystem.Arg args, string message)
        {
            if (args.Player() != null)
                args.Player().ConsoleMessage(message);
            else
                Puts(message);
        }

        private bool IsOnCooldown(BasePlayer player)
        {
            float last;
            if (_cooldowns.TryGetValue(player.userID, out last) && UnityEngine.Time.realtimeSinceStartup - last < 0.4f)
                return true;

            _cooldowns[player.userID] = UnityEngine.Time.realtimeSinceStartup;
            return false;
        }

        #endregion

        #region Interface

        private const string
            Layer = "UI.ShopMenu",
            LayerMain = Layer + ".Main",
            LayerHeader = Layer + ".Header",
            LayerBalance = Layer + ".Balance",
            LayerSidebar = Layer + ".Sidebar",
            LayerContent = Layer + ".Content",
            LayerModal = Layer + ".Modal",
            LayerNotify = Layer + ".Notify";

        private void OpenMenu(BasePlayer player, int tab, bool full = true, bool requestRemote = true)
        {
            if (player == null || player.IsSleeping()) return;

            _tabs[player.userID] = tab;

            if (tab == TabBasket && requestRemote && _config.GameStores.Enabled)
                RequestRemoteBasket(player);

            var container = new CuiElementContainer();

            if (full)
            {
                BackgroundUi(container);
                HeaderUi(container, player);
            }

            SidebarUi(container, player, tab);
            ContentUi(container, player, tab);

            CuiHelper.AddUi(player, container);

            RefreshBalance(player);
        }

        private void BackgroundUi(CuiElementContainer container)
        {
            var image = new CuiImageComponent { Color = _config.UI.Background.Get };

            if (_config.UI.Blur) image.Material = "assets/content/ui/uibackgroundblur.mat";

            container.Add(new CuiElement
            {
                Name = Layer,
                Parent = "Overlay",
                DestroyUi = Layer,
                Components =
                {
                    image,
                    new CuiRectTransformComponent { AnchorMin = "0 0", AnchorMax = "1 1" },
                    new CuiNeedsCursorComponent()
                }
            });

            // клик по фону закрывает меню
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1" },
                Button = { Color = "0 0 0 0", Close = Layer, Command = "UI_ShopMenu close" },
                Text = { Text = string.Empty }
            }, Layer, Layer + ".Close");

            var w = _config.UI.Width / 2f;
            var h = _config.UI.Height / 2f;

            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0.5 0.5", AnchorMax = "0.5 0.5",
                    OffsetMin = Off(-w, -h), OffsetMax = Off(w, h)
                },
                Image = { Color = _config.UI.Menu.Get }
            }, Layer, LayerMain);
        }

        private void HeaderUi(CuiElementContainer container, BasePlayer player)
        {
            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0 1", AnchorMax = "1 1",
                    OffsetMin = Off(0f, -HeaderHeight), OffsetMax = "0 0"
                },
                Image = { Color = "0 0 0 0" }
            }, LayerMain, LayerHeader);

            // Аватарка стима
            container.Add(new CuiElement
            {
                Parent = LayerHeader,
                Name = LayerHeader + ".Avatar",
                Components =
                {
                    new CuiRawImageComponent { SteamId = player.UserIDString },
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "0 0", AnchorMax = "0 1",
                        OffsetMin = "0 0", OffsetMax = Off(HeaderHeight, 0f)
                    }
                }
            });

            // Ник игрока
            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0 0", AnchorMax = "1 1",
                    OffsetMin = Off(HeaderHeight + Margin, 0f), OffsetMax = Off(-(BalanceWidth + HeaderHeight + Margin * 2f), 0f)
                },
                Image = { Color = _config.UI.Panel.Get }
            }, LayerHeader, LayerHeader + ".Nick");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "14 0", OffsetMax = "-14 0" },
                Text =
                {
                    Text = Truncate(StripTags(player.displayName), 560f, 16), Align = TextAnchor.MiddleLeft,
                    Font = "robotocondensed-bold.ttf", FontSize = 16, Color = _config.UI.Nick.Get
                }
            }, LayerHeader + ".Nick");

            // Баланс магазина
            BalanceUi(container, player);

            // Кнопка пополнения
            container.Add(new CuiButton
            {
                RectTransform =
                {
                    AnchorMin = "1 0", AnchorMax = "1 1",
                    OffsetMin = Off(-HeaderHeight, 0f), OffsetMax = "0 0"
                },
                Button = { Color = _config.UI.Accent.Get, Command = "UI_ShopMenu topup" },
                Text =
                {
                    Text = "+", Align = TextAnchor.MiddleCenter,
                    Font = "robotocondensed-bold.ttf", FontSize = 26, Color = "1 1 1 0.9"
                }
            }, LayerHeader, LayerHeader + ".TopUp");
        }

        private void BalanceUi(CuiElementContainer container, BasePlayer player)
        {
            container.Add(new CuiElement
            {
                Name = LayerBalance,
                Parent = LayerHeader,
                DestroyUi = LayerBalance,
                Components =
                {
                    new CuiImageComponent { Color = _config.UI.Panel.Get },
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "1 0", AnchorMax = "1 1",
                        OffsetMin = Off(-(BalanceWidth + HeaderHeight + Margin), 0f),
                        OffsetMax = Off(-(HeaderHeight + Margin), 0f)
                    }
                }
            });

            var textOffset = 14f;

            if (!string.IsNullOrEmpty(_config.CurrencyIcon))
            {
                container.Add(new CuiElement
                {
                    Parent = LayerBalance,
                    Components =
                    {
                        GetImageComponent(_config.CurrencyIcon, _config.UI.Price.Get),
                        new CuiRectTransformComponent
                        {
                            AnchorMin = "0 0.5", AnchorMax = "0 0.5",
                            OffsetMin = "12 -9", OffsetMax = "30 9"
                        }
                    }
                });

                textOffset = 38f;
            }

            container.Add(new CuiLabel
            {
                RectTransform =
                {
                    AnchorMin = "0 0", AnchorMax = "1 1",
                    OffsetMin = Off(textOffset, 0f), OffsetMax = "-12 0"
                },
                Text =
                {
                    Text = FormatBalance(GetCachedBalance(player)), Align = TextAnchor.MiddleLeft,
                    Font = "robotocondensed-bold.ttf", FontSize = 16, Color = "0.9 0.9 0.9 1"
                }
            }, LayerBalance);
        }

        private void SidebarUi(CuiElementContainer container, BasePlayer player, int tab)
        {
            container.Add(new CuiElement
            {
                Name = LayerSidebar,
                Parent = LayerMain,
                DestroyUi = LayerSidebar,
                Components =
                {
                    new CuiImageComponent { Color = _config.UI.Sidebar.Get },
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "0 0", AnchorMax = "0 1",
                        OffsetMin = "0 0", OffsetMax = Off(HeaderHeight, -(HeaderHeight + Margin))
                    }
                }
            });

            TabButtonUi(container, TabStore, tab, _config.UI.StoreIcon, 0f);
            TabButtonUi(container, TabBasket, tab, _config.UI.BasketIcon, HeaderHeight + Margin);
        }

        private void TabButtonUi(CuiElementContainer container, int tab, int currentTab, string icon, float offset)
        {
            var selected = tab == currentTab;
            var name = LayerSidebar + $".Tab.{tab}";

            container.Add(new CuiButton
            {
                RectTransform =
                {
                    AnchorMin = "0 1", AnchorMax = "0 1",
                    OffsetMin = Off(0f, -(offset + HeaderHeight)), OffsetMax = Off(HeaderHeight, -offset)
                },
                Button =
                {
                    Color = selected ? _config.UI.Accent.Get : _config.UI.Panel.Get,
                    Command = selected ? string.Empty : $"UI_ShopMenu tab {tab}"
                },
                Text = { Text = string.Empty }
            }, LayerSidebar, name);

            if (string.IsNullOrEmpty(icon)) return;

            container.Add(new CuiElement
            {
                Parent = name,
                Components =
                {
                    GetImageComponent(icon, selected ? "1 1 1 1" : _config.UI.InactiveIcon.Get),
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "0 0", AnchorMax = "1 1",
                        OffsetMin = "12 12", OffsetMax = "-12 -12"
                    }
                }
            });
        }

        private void ContentUi(CuiElementContainer container, BasePlayer player, int tab)
        {
            container.Add(new CuiElement
            {
                Name = LayerContent,
                Parent = LayerMain,
                DestroyUi = LayerContent,
                Components =
                {
                    new CuiImageComponent { Color = "0 0 0 0" },
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "0 0", AnchorMax = "1 1",
                        OffsetMin = Off(HeaderHeight + Margin, 0f), OffsetMax = Off(0f, -(HeaderHeight + Margin))
                    }
                }
            });

            if (tab == TabBasket)
                BasketContentUi(container, player);
            else
                StoreContentUi(container, player);
        }

        #region Content.Store

        private void StoreContentUi(CuiElementContainer container, BasePlayer player)
        {
            var products = GetAvailableProducts(player);
            if (products.Count == 0)
            {
                EmptyLabelUi(container, LayerContent, Msg(player, MsgStoreEmpty));
                return;
            }

            var perRow = Mathf.Max(1, _config.UI.ItemsOnString);
            var margin = _config.UI.CardMargin;
            var cardHeight = _config.UI.CardHeight;
            var contentWidth = _config.UI.Width - HeaderHeight - Margin;
            var cardWidth = (contentWidth - margin * (perRow - 1)) / perRow;

            var rows = Mathf.CeilToInt((float)products.Count / perRow);
            var totalHeight = rows * cardHeight + (rows - 1) * margin;

            var scroll = ScrollViewUi(container, LayerContent, LayerContent + ".Scroll", totalHeight,
                _config.UI.Height - HeaderHeight - Margin);

            for (var i = 0; i < products.Count; i++)
            {
                var row = i / perRow;
                var column = i % perRow;

                var x = column * (cardWidth + margin);
                var y = -(row * (cardHeight + margin));

                ProductCardUi(container, player, scroll, products[i], i, x, y, cardWidth, cardHeight);
            }
        }

        private void ProductCardUi(CuiElementContainer container, BasePlayer player,
            string parent, Configuration.ProductConfig product, int index,
            float x, float y, float width, float height)
        {
            var card = parent + $".Card.{index}";

            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0 1", AnchorMax = "0 1",
                    OffsetMin = Off(x, y - height), OffsetMax = Off(x + width, y)
                },
                Image = { Color = _config.UI.Card.Get }
            }, parent, card);

            // Подложка под названием и ценой
            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0 0", AnchorMax = "1 0",
                    OffsetMin = "0 0", OffsetMax = Off(0f, FooterHeight)
                },
                Image = { Color = _config.UI.CardFooter.Get }
            }, card, card + ".Footer");

            // Картинка товара
            container.Add(new CuiElement
            {
                Parent = card,
                Components =
                {
                    GetImageComponent(GetProductImage(product), "1 1 1 1"),
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "0 0", AnchorMax = "1 1",
                        OffsetMin = Off(16f, FooterHeight + 24f), OffsetMax = "-16 -24"
                    }
                }
            });

            // Осталось N
            var stock = GetStock(product);
            if (stock >= 0)
                container.Add(new CuiLabel
                {
                    RectTransform = { AnchorMin = "0 1", AnchorMax = "1 1", OffsetMin = "8 -22", OffsetMax = "-8 -4" },
                    Text =
                    {
                        Text = Msg(player, MsgStockLeft, stock), Align = TextAnchor.MiddleLeft,
                        Font = "robotocondensed-regular.ttf", FontSize = 11, Color = _config.UI.TextSecondary.Get
                    }
                }, card);

            // Скидка
            if (product.Discount > 0)
                container.Add(new CuiLabel
                {
                    RectTransform = { AnchorMin = "0 1", AnchorMax = "1 1", OffsetMin = "8 -22", OffsetMax = "-8 -4" },
                    Text =
                    {
                        Text = $"-{product.Discount}%", Align = TextAnchor.MiddleRight,
                        Font = "robotocondensed-regular.ttf", FontSize = 11, Color = _config.UI.Price.Get
                    }
                }, card);

            // Количество
            if (product.Amount > 1 || product.IsItem)
                container.Add(new CuiLabel
                {
                    RectTransform =
                    {
                        AnchorMin = "0 0", AnchorMax = "1 0",
                        OffsetMin = Off(8f, FooterHeight + 2f), OffsetMax = Off(-10f, FooterHeight + 24f)
                    },
                    Text =
                    {
                        Text = $"x{product.Amount}", Align = TextAnchor.MiddleRight,
                        Font = "robotocondensed-regular.ttf", FontSize = 14, Color = _config.UI.Text.Get
                    }
                }, card);

            // Название товара
            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 0", OffsetMin = "10 28", OffsetMax = "-10 50" },
                Text =
                {
                    Text = Truncate(product.Name, width - 20f, 12), Align = TextAnchor.MiddleLeft,
                    Font = "robotocondensed-regular.ttf", FontSize = 12, Color = _config.UI.Text.Get
                }
            }, card);

            // Цена
            var price = product.Price.ToString();

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 0", OffsetMin = "10 4", OffsetMax = "-10 28" },
                Text =
                {
                    Text = price, Align = TextAnchor.MiddleLeft,
                    Font = "robotocondensed-bold.ttf", FontSize = 17, Color = _config.UI.Price.Get
                }
            }, card);

            CurrencyUi(container, card, 10f + price.Length * 9f + 4f);

            // Кнопка покупки
            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1" },
                Button = { Color = "0 0 0 0", Command = $"UI_ShopMenu buy {product.Id}" },
                Text = { Text = string.Empty }
            }, card, card + ".Buy");
        }

        private void CurrencyUi(CuiElementContainer container, string parent, float offset)
        {
            if (!string.IsNullOrEmpty(_config.CurrencyIcon))
            {
                container.Add(new CuiElement
                {
                    Parent = parent,
                    Components =
                    {
                        GetImageComponent(_config.CurrencyIcon, _config.UI.Price.Get),
                        new CuiRectTransformComponent
                        {
                            AnchorMin = "0 0", AnchorMax = "0 0",
                            OffsetMin = Off(offset, 9f), OffsetMax = Off(offset + 15f, 24f)
                        }
                    }
                });

                return;
            }

            if (string.IsNullOrEmpty(_config.CurrencyName)) return;

            container.Add(new CuiLabel
            {
                RectTransform =
                {
                    AnchorMin = "0 0", AnchorMax = "0 0",
                    OffsetMin = Off(offset, 4f), OffsetMax = Off(offset + 60f, 28f)
                },
                Text =
                {
                    Text = _config.CurrencyName, Align = TextAnchor.MiddleLeft,
                    Font = "robotocondensed-bold.ttf", FontSize = 15, Color = _config.UI.Price.Get
                }
            }, parent);
        }

        #endregion

        #region Content.Basket

        private void BasketContentUi(CuiElementContainer container, BasePlayer player)
        {
            // Строка «Ваши предметы» + кнопка обновления
            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0 1", AnchorMax = "1 1",
                    OffsetMin = "0 -36", OffsetMax = "0 0"
                },
                Image = { Color = _config.UI.Panel.Get }
            }, LayerContent, LayerContent + ".Head");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "14 0", OffsetMax = "-140 0" },
                Text =
                {
                    Text = Msg(player, MsgYourItems), Align = TextAnchor.MiddleLeft,
                    Font = "robotocondensed-regular.ttf", FontSize = 14, Color = _config.UI.Text.Get
                }
            }, LayerContent + ".Head");

            container.Add(new CuiButton
            {
                RectTransform =
                {
                    AnchorMin = "1 0", AnchorMax = "1 1",
                    OffsetMin = "-134 3", OffsetMax = "-3 -3"
                },
                Button = { Color = _config.UI.Accent.Get, Command = $"UI_ShopMenu tab {TabBasket}" },
                Text =
                {
                    Text = Msg(player, MsgRefresh), Align = TextAnchor.MiddleCenter,
                    Font = "robotocondensed-bold.ttf", FontSize = 13, Color = "1 1 1 0.9"
                }
            }, LayerContent + ".Head", LayerContent + ".Refresh");

            var items = GetBasketItems(player);
            if (items.Count == 0)
            {
                EmptyLabelUi(container, LayerContent, _remoteLoading.Contains(player.userID)
                    ? Msg(player, MsgLoading)
                    : Msg(player, MsgBasketEmpty), 40f);
                return;
            }

            var perRow = Mathf.Max(1, _config.UI.ItemsOnString);
            var margin = _config.UI.CardMargin;
            var cardHeight = _config.UI.CardHeight;
            var contentWidth = _config.UI.Width - HeaderHeight - Margin;
            var cardWidth = (contentWidth - margin * (perRow - 1)) / perRow;

            var rows = Mathf.CeilToInt((float)items.Count / perRow);
            var totalHeight = rows * cardHeight + (rows - 1) * margin;

            var scroll = ScrollViewUi(container, LayerContent, LayerContent + ".Scroll", totalHeight,
                _config.UI.Height - HeaderHeight - Margin - 40f, 40f);

            for (var i = 0; i < items.Count; i++)
            {
                var row = i / perRow;
                var column = i % perRow;

                var x = column * (cardWidth + margin);
                var y = -(row * (cardHeight + margin));

                BasketCardUi(container, player, scroll, items[i], i, x, y, cardWidth, cardHeight);
            }
        }

        private void BasketCardUi(CuiElementContainer container, BasePlayer player,
            string parent, BasketItem item, int index, float x, float y, float width, float height)
        {
            var card = parent + $".Item.{index}";

            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0 1", AnchorMax = "0 1",
                    OffsetMin = Off(x, y - height), OffsetMax = Off(x + width, y)
                },
                Image = { Color = _config.UI.Card.Get }
            }, parent, card);

            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0 0", AnchorMax = "1 0",
                    OffsetMin = "0 0", OffsetMax = Off(0f, FooterHeight)
                },
                Image = { Color = _config.UI.CardFooter.Get }
            }, card, card + ".Footer");

            container.Add(new CuiElement
            {
                Parent = card,
                Components =
                {
                    GetImageComponent(GetBasketImage(item), "1 1 1 1"),
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "0 0", AnchorMax = "1 1",
                        OffsetMin = Off(16f, FooterHeight + 24f), OffsetMax = "-16 -24"
                    }
                }
            });

            if (item.IsRemote)
                container.Add(new CuiLabel
                {
                    RectTransform = { AnchorMin = "0 1", AnchorMax = "1 1", OffsetMin = "8 -22", OffsetMax = "-8 -4" },
                    Text =
                    {
                        Text = Msg(player, MsgFromStore), Align = TextAnchor.MiddleLeft,
                        Font = "robotocondensed-regular.ttf", FontSize = 11, Color = _config.UI.TextSecondary.Get
                    }
                }, card);

            if (item.Amount > 1)
                container.Add(new CuiLabel
                {
                    RectTransform =
                    {
                        AnchorMin = "0 0", AnchorMax = "1 0",
                        OffsetMin = Off(8f, FooterHeight + 2f), OffsetMax = Off(-10f, FooterHeight + 24f)
                    },
                    Text =
                    {
                        Text = $"x{item.Amount}", Align = TextAnchor.MiddleRight,
                        Font = "robotocondensed-regular.ttf", FontSize = 14, Color = _config.UI.Text.Get
                    }
                }, card);

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 0", OffsetMin = "10 28", OffsetMax = "-10 50" },
                Text =
                {
                    Text = Truncate(item.Name, width - 20f, 12), Align = TextAnchor.MiddleLeft,
                    Font = "robotocondensed-regular.ttf", FontSize = 12, Color = _config.UI.Text.Get
                }
            }, card);

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 0", OffsetMin = "10 4", OffsetMax = "-10 28" },
                Text =
                {
                    Text = Msg(player, MsgTake), Align = TextAnchor.MiddleLeft,
                    Font = "robotocondensed-bold.ttf", FontSize = 15, Color = _config.UI.Price.Get
                }
            }, card);

            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1" },
                Button
                    = { Color = "0 0 0 0", Command = $"UI_ShopMenu take {(item.IsRemote ? "gs:" + item.RemoteId : item.Id.ToString())}" },
                Text = { Text = string.Empty }
            }, card, card + ".Take");
        }

        #endregion

        #region UI.Elements

        private float HeaderHeight => 48f;
        private float Margin => 4f;
        private float FooterHeight => 58f;
        private float BalanceWidth => 150f;

        private string ScrollViewUi(CuiElementContainer container, string parent, string name,
            float contentHeight, float viewHeight, float topOffset = 0f)
        {
            container.Add(new CuiElement
            {
                Name = name,
                Parent = parent,
                Components =
                {
                    new CuiScrollViewComponent
                    {
                        Horizontal = false,
                        Vertical = true,
                        MovementType = ScrollRect.MovementType.Clamped,
                        Inertia = true,
                        DecelerationRate = 0.2f,
                        ScrollSensitivity = 26f,
                        ContentTransform = new CuiRectTransform
                        {
                            AnchorMin = "0 1", AnchorMax = "1 1",
                            OffsetMin = Off(0f, -Mathf.Max(contentHeight, viewHeight)), OffsetMax = "0 0"
                        },
                        VerticalScrollbar = new CuiScrollbar
                        {
                            AutoHide = true,
                            Size = 4f,
                            HandleColor = _config.UI.Accent.Get,
                            HighlightColor = _config.UI.Accent.Get,
                            PressedColor = _config.UI.Accent.Get,
                            TrackColor = "0 0 0 0"
                        }
                    },
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "0 0", AnchorMax = "1 1",
                        OffsetMin = "0 0", OffsetMax = Off(0f, -topOffset)
                    }
                }
            });

            return name;
        }

        private void EmptyLabelUi(CuiElementContainer container, string parent, string text, float topOffset = 0f)
        {
            container.Add(new CuiLabel
            {
                RectTransform =
                {
                    AnchorMin = "0 0", AnchorMax = "1 1",
                    OffsetMin = "0 0", OffsetMax = Off(0f, -topOffset)
                },
                Text =
                {
                    Text = text, Align = TextAnchor.MiddleCenter,
                    Font = "robotocondensed-bold.ttf", FontSize = 24, Color = _config.UI.TextSecondary.Get
                }
            }, parent);
        }

        private void ConfirmUi(BasePlayer player, Configuration.ProductConfig product)
        {
            var container = new CuiElementContainer();

            container.Add(new CuiElement
            {
                Name = LayerModal,
                Parent = Layer,
                DestroyUi = LayerModal,
                Components =
                {
                    new CuiImageComponent { Color = "0 0 0 0.6" },
                    new CuiRectTransformComponent { AnchorMin = "0 0", AnchorMax = "1 1" }
                }
            });

            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1" },
                Button = { Color = "0 0 0 0", Command = "UI_ShopMenu closemodal" },
                Text = { Text = string.Empty }
            }, LayerModal);

            container.Add(new CuiPanel
            {
                RectTransform =
                {
                    AnchorMin = "0.5 0.5", AnchorMax = "0.5 0.5",
                    OffsetMin = "-180 -95", OffsetMax = "180 95"
                },
                Image = { Color = _config.UI.Menu.Get }
            }, LayerModal, LayerModal + ".Panel");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 1", AnchorMax = "1 1", OffsetMin = "14 -46", OffsetMax = "-14 -14" },
                Text =
                {
                    Text = Msg(player, MsgConfirmTitle), Align = TextAnchor.MiddleCenter,
                    Font = "robotocondensed-bold.ttf", FontSize = 16, Color = _config.UI.Text.Get
                }
            }, LayerModal + ".Panel");

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "14 42", OffsetMax = "-14 -46" },
                Text =
                {
                    Text = Msg(player, MsgConfirmDescription, product.Name, product.Price,
                        _config.CurrencyName), Align = TextAnchor.MiddleCenter,
                    Font = "robotocondensed-regular.ttf", FontSize = 14, Color = _config.UI.TextSecondary.Get
                }
            }, LayerModal + ".Panel");

            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "0.5 0", OffsetMin = "14 12", OffsetMax = "-5 44" },
                Button = { Color = _config.UI.Panel.Get, Command = "UI_ShopMenu closemodal" },
                Text =
                {
                    Text = Msg(player, MsgCancel), Align = TextAnchor.MiddleCenter,
                    Font = "robotocondensed-bold.ttf", FontSize = 13, Color = _config.UI.Text.Get
                }
            }, LayerModal + ".Panel");

            container.Add(new CuiButton
            {
                RectTransform = { AnchorMin = "0.5 0", AnchorMax = "1 0", OffsetMin = "5 12", OffsetMax = "-14 44" },
                Button = { Color = _config.UI.Accent.Get, Command = $"UI_ShopMenu buyconfirm {product.Id}" },
                Text =
                {
                    Text = Msg(player, MsgBuy), Align = TextAnchor.MiddleCenter,
                    Font = "robotocondensed-bold.ttf", FontSize = 13, Color = "1 1 1 0.9"
                }
            }, LayerModal + ".Panel");

            CuiHelper.AddUi(player, container);
        }

        private void ShowNotify(BasePlayer player, string text)
        {
            if (!IsMenuOpen(player))
            {
                player.ChatMessage(text);
                return;
            }

            var container = new CuiElementContainer();

            container.Add(new CuiElement
            {
                Name = LayerNotify,
                Parent = LayerMain,
                DestroyUi = LayerNotify,
                Components =
                {
                    new CuiImageComponent { Color = _config.UI.Panel.Get, FadeIn = 0.2f },
                    new CuiRectTransformComponent
                    {
                        AnchorMin = "0 0", AnchorMax = "1 0",
                        OffsetMin = Off(HeaderHeight + Margin, 8f), OffsetMax = "-8 46"
                    }
                }
            });

            container.Add(new CuiLabel
            {
                RectTransform = { AnchorMin = "0 0", AnchorMax = "1 1", OffsetMin = "14 0", OffsetMax = "-14 0" },
                Text =
                {
                    Text = text, Align = TextAnchor.MiddleCenter, FadeIn = 0.2f,
                    Font = "robotocondensed-regular.ttf", FontSize = 14, Color = _config.UI.Text.Get
                }
            }, LayerNotify);

            CuiHelper.AddUi(player, container);

            timer.In(4f, () =>
            {
                if (player != null && player.IsConnected) CuiHelper.DestroyUi(player, LayerNotify);
            });
        }

        private void RefreshBalance(BasePlayer player)
        {
            GetBalance(player.userID, balance =>
            {
                _balances[player.userID] = balance;

                if (!IsMenuOpen(player)) return;

                var container = new CuiElementContainer();

                BalanceUi(container, player);

                CuiHelper.AddUi(player, container);
            });
        }

        private bool IsMenuOpen(BasePlayer player)
        {
            return player != null && player.IsConnected && _tabs.ContainsKey(player.userID);
        }

        private int GetTab(BasePlayer player)
        {
            int tab;
            return _tabs.TryGetValue(player.userID, out tab) ? tab : TabStore;
        }

        private static string Off(float x, float y)
        {
            return string.Format(CultureInfo.InvariantCulture, "{0:0.##} {1:0.##}", x, y);
        }

        private static string StripTags(string text)
        {
            if (string.IsNullOrEmpty(text)) return string.Empty;

            return text.Replace("<", "‹").Replace(">", "›");
        }

        private static string Truncate(string text, float width, int fontSize)
        {
            if (string.IsNullOrEmpty(text)) return string.Empty;

            var max = Mathf.FloorToInt(width / (fontSize * 0.54f));
            if (max <= 1 || text.Length <= max) return text;

            return text.Substring(0, Mathf.Max(1, max - 1)) + "…";
        }

        #endregion

        #endregion

        #region Purchase

        private void TryBuy(BasePlayer player, string productId, bool confirmed)
        {
            var product = FindProduct(productId);
            if (product == null)
            {
                ShowNotify(player, Msg(player, MsgProductNotFound));
                return;
            }

            if (!CanUseProduct(player, product))
            {
                ShowNotify(player, Msg(player, MsgNoPermission));
                return;
            }

            var stock = GetStock(product);
            if (stock == 0)
            {
                ShowNotify(player, Msg(player, MsgOutOfStock));
                return;
            }

            if (_config.BuyConfirmation && !confirmed)
            {
                ConfirmUi(player, product);
                return;
            }

            GetBalance(player.userID, balance =>
            {
                _balances[player.userID] = balance;

                if (balance < product.Price)
                {
                    ShowNotify(player, Msg(player, MsgNoMoney, FormatBalance(product.Price - balance)));
                    return;
                }

                Withdraw(player.userID, product.Price, success =>
                {
                    if (!success)
                    {
                        ShowNotify(player, Msg(player, MsgBuyError));
                        return;
                    }

                    if (product.Stock >= 0)
                    {
                        var left = GetStock(product) - 1;

                        _data.Stock[product.Id] = Mathf.Max(0, left);
                    }

                    var basketItem = CreateBasketItem(product);

                    var given = false;
                    if (product.GiveInstantly)
                    {
                        string error;

                        given = GiveItem(player, basketItem, out error);
                    }

                    if (!given)
                    {
                        GetPlayerInfo(player.userID).Items.Add(basketItem);

                        ShowNotify(player, Msg(player, MsgBoughtToBasket, product.Name));
                    }

                    SaveData();

                    if (_config.LogPurchases)
                        LogToFile("purchases",
                            $"[{DateTime.Now:dd.MM.yyyy HH:mm:ss}] {player.displayName} ({player.userID}) купил «{product.Name}» [{product.Id}] за {product.Price}",
                            this);

                    Interface.CallHook("OnShopMenuPurchase", player, product.Id, product.Price);

                    RefreshBalance(player);

                    if (IsMenuOpen(player)) OpenMenu(player, GetTab(player), false);
                });
            });
        }

        private void TryTake(BasePlayer player, string rawId)
        {
            if (player.IsDead() || player.IsWounded())
            {
                ShowNotify(player, Msg(player, MsgDeadOrWounded));
                return;
            }

            if (_config.BlockBuildingBlocked && player.IsBuildingBlocked())
            {
                ShowNotify(player, Msg(player, MsgBuildingBlocked));
                return;
            }

            if (rawId.StartsWith("gs:", StringComparison.OrdinalIgnoreCase))
            {
                TakeRemoteItem(player, rawId.Substring(3));
                return;
            }

            int id;
            if (!int.TryParse(rawId, out id)) return;

            var info = GetPlayerInfo(player.userID);

            var item = info.Items.FirstOrDefault(x => x.Id == id);
            if (item == null)
            {
                ShowNotify(player, Msg(player, MsgItemNotFound));
                return;
            }

            string error;
            if (!GiveItem(player, item, out error))
            {
                ShowNotify(player, error);
                return;
            }

            info.Items.Remove(item);

            SaveData();

            OpenMenu(player, TabBasket, false, false);
        }

        private void AddToBasket(ulong userId, Configuration.ProductConfig product)
        {
            var info = GetPlayerInfo(userId);

            info.Items.Add(CreateBasketItem(product));

            SaveData();
        }

        private BasketItem CreateBasketItem(Configuration.ProductConfig product)
        {
            return new BasketItem
            {
                Id = ++_data.LastItemId,
                ProductId = product.Id,
                Name = product.Name,
                Image = product.Image,
                Amount = Mathf.Max(1, product.Amount),
                Type = product.Type,
                Shortname = product.Shortname,
                SkinID = product.SkinID,
                Commands = product.Commands != null ? new List<string>(product.Commands) : new List<string>(),
                Time = CurrentTime(),
                Source = SourcePlugin
            };
        }

        private bool GiveItem(BasePlayer player, BasketItem basketItem, out string error)
        {
            error = string.Empty;

            try
            {
                if (basketItem.IsCommand)
                {
                    foreach (var command in basketItem.Commands)
                    {
                        if (string.IsNullOrEmpty(command)) continue;

                        Server.Command(command
                            .Replace("%steamid%", player.UserIDString)
                            .Replace("%username%", player.displayName));
                    }

                    ShowNotify(player, Msg(player, MsgReceivedCommand, basketItem.Name));
                    return true;
                }

                var definition = ItemManager.FindItemDefinition(basketItem.Shortname);
                if (definition == null)
                {
                    error = Msg(player, MsgItemNotFound);
                    PrintError($"Не найден предмет «{basketItem.Shortname}» для товара «{basketItem.Name}»!");
                    return false;
                }

                Item item;

                if (basketItem.IsBlueprint)
                {
                    item = ItemManager.Create(ItemManager.blueprintBaseDef);
                    item.blueprintTarget = definition.itemid;
                }
                else
                {
                    item = ItemManager.Create(definition, Mathf.Max(1, basketItem.Amount), basketItem.SkinID);
                }

                if (item == null)
                {
                    error = Msg(player, MsgItemNotFound);
                    return false;
                }

                if (!player.inventory.GiveItem(item))
                {
                    item.Drop(player.GetDropPosition(), player.GetDropVelocity());

                    ShowNotify(player, Msg(player, MsgReceivedFeet, basketItem.Name));
                }
                else
                {
                    ShowNotify(player, Msg(player, MsgReceived, basketItem.Name));
                }

                return true;
            }
            catch (Exception e)
            {
                error = Msg(player, MsgBuyError);

                PrintError($"Ошибка выдачи товара «{basketItem.Name}»: {e}");
                return false;
            }
        }

        private Configuration.ProductConfig FindProduct(string id)
        {
            return _config.Products.FirstOrDefault(x => x.Id == id);
        }

        private List<Configuration.ProductConfig> GetAvailableProducts(BasePlayer player)
        {
            var result = new List<Configuration.ProductConfig>();

            foreach (var product in _config.Products)
            {
                if (string.IsNullOrEmpty(product.Id)) continue;

                if (!CanUseProduct(player, product)) continue;

                result.Add(product);
            }

            return result;
        }

        private bool CanUseProduct(BasePlayer player, Configuration.ProductConfig product)
        {
            return string.IsNullOrEmpty(product.Permission) ||
                   permission.UserHasPermission(player.UserIDString, product.Permission);
        }

        private List<BasketItem> GetBasketItems(BasePlayer player)
        {
            var result = new List<BasketItem>(GetPlayerInfo(player.userID).Items);

            List<BasketItem> remote;
            if (_remoteBaskets.TryGetValue(player.userID, out remote) && remote != null)
                result.AddRange(remote);

            return result;
        }

        #endregion

        #region Balance

        private double GetCachedBalance(BasePlayer player)
        {
            double balance;
            if (_balances.TryGetValue(player.userID, out balance)) return balance;

            if (IsInternal || IsEconomics || IsServerRewards)
            {
                balance = GetBalanceSync(player.userID);

                _balances[player.userID] = balance;
            }

            return balance;
        }

        private bool IsInternal => _config.BalanceSource.Equals("Internal", StringComparison.OrdinalIgnoreCase);
        private bool IsEconomics => _config.BalanceSource.Equals("Economics", StringComparison.OrdinalIgnoreCase);
        private bool IsServerRewards => _config.BalanceSource.Equals("ServerRewards", StringComparison.OrdinalIgnoreCase);
        private bool IsGameStoresBalance => _config.BalanceSource.Equals("GameStores", StringComparison.OrdinalIgnoreCase);

        private double GetBalanceSync(ulong userId)
        {
            if (IsEconomics && Economics != null)
                return Convert.ToDouble(Economics.Call("Balance", userId));

            if (IsServerRewards && ServerRewards != null)
                return Convert.ToDouble(ServerRewards.Call("CheckPoints", userId));

            return GetPlayerInfo(userId).Balance;
        }

        private void GetBalance(ulong userId, Action<double> callback)
        {
            if (IsGameStoresBalance && _config.GameStores.Enabled)
            {
                GS_Request("players.item.balance", new Dictionary<string, string> { { "steamId", userId.ToString() } },
                    (code, response) =>
                    {
                        double balance = 0;

                        try
                        {
                            if (code == 200 || code == 400)
                            {
                                var json = JObject.Parse(response);
                                if (json["result"] != null && json["result"].ToString() == "success")
                                {
                                    var value = json["data"] != null ? json["data"]["balance"] : null;
                                    if (value != null)
                                        double.TryParse(value.ToString(), NumberStyles.Any,
                                            CultureInfo.InvariantCulture, out balance);
                                }
                            }
                        }
                        catch (Exception e)
                        {
                            PrintError($"Ошибка получения баланса GameStores: {e.Message}");
                        }

                        callback(balance);
                    });

                return;
            }

            callback(GetBalanceSync(userId));
        }

        private void Withdraw(ulong userId, int amount, Action<bool> callback)
        {
            if (amount <= 0)
            {
                callback(true);
                return;
            }

            if (IsGameStoresBalance && _config.GameStores.Enabled)
            {
                GS_Request("players.item.balance.change", new Dictionary<string, string>
                {
                    { "steamId", userId.ToString() },
                    { "type", "minus" },
                    { "amount", amount.ToString() }
                }, (code, response) =>
                {
                    var success = false;

                    try
                    {
                        if (code == 200 || code == 400)
                        {
                            var json = JObject.Parse(response);
                            success = json["result"] != null && json["result"].ToString() == "success";
                        }
                    }
                    catch (Exception e)
                    {
                        PrintError($"Ошибка списания баланса GameStores: {e.Message}");
                    }

                    callback(success);
                });

                return;
            }

            if (IsEconomics && Economics != null)
            {
                callback(Convert.ToBoolean(Economics.Call("Withdraw", userId, (double)amount)));
                return;
            }

            if (IsServerRewards && ServerRewards != null)
            {
                callback(Convert.ToBoolean(ServerRewards.Call("TakePoints", userId, amount)));
                return;
            }

            var info = GetPlayerInfo(userId);
            if (info.Balance < amount)
            {
                callback(false);
                return;
            }

            info.Balance -= amount;

            callback(true);
        }

        private void Deposit(ulong userId, int amount, Action<bool> callback)
        {
            if (IsGameStoresBalance && _config.GameStores.Enabled)
            {
                GS_Request("players.item.balance.change", new Dictionary<string, string>
                {
                    { "steamId", userId.ToString() },
                    { "type", amount >= 0 ? "plus" : "minus" },
                    { "amount", Math.Abs(amount).ToString() }
                }, (code, response) =>
                {
                    var success = false;

                    try
                    {
                        if (code == 200 || code == 400)
                        {
                            var json = JObject.Parse(response);
                            success = json["result"] != null && json["result"].ToString() == "success";
                        }
                    }
                    catch (Exception e)
                    {
                        PrintError($"Ошибка пополнения баланса GameStores: {e.Message}");
                    }

                    callback(success);
                });

                return;
            }

            if (IsEconomics && Economics != null)
            {
                Economics.Call("Deposit", userId, (double)amount);
                callback(true);
                return;
            }

            if (IsServerRewards && ServerRewards != null)
            {
                ServerRewards.Call("AddPoints", userId, amount);
                callback(true);
                return;
            }

            var info = GetPlayerInfo(userId);

            info.Balance = Math.Max(0, info.Balance + amount);

            SaveData();

            callback(true);
        }

        private string FormatBalance(double value)
        {
            return Math.Round(value).ToString(CultureInfo.InvariantCulture);
        }

        #endregion

        #region GameStores Integration

        private void GS_Request(string method, Dictionary<string, string> args, Action<int, string> callback)
        {
            if (!_config.GameStores.Enabled)
            {
                callback(0, string.Empty);
                return;
            }

            var url =
                $"{_config.GameStores.ApiLink}{method}?store_id={_config.GameStores.ShopID}&server_id={_config.GameStores.ServerID}";

            var coroutine = ServerMgr.Instance.StartCoroutine(GS_PostAsync(url, args, callback));

            _coroutines.Add(coroutine);
        }

        private IEnumerator GS_PostAsync(string url, Dictionary<string, string> fields, Action<int, string> callback)
        {
            using (var request = UnityWebRequest.Post(url, fields ?? new Dictionary<string, string>()))
            {
                request.timeout = 30;

                request.SetRequestHeader("User-Agent", "GameStoresMenu Plugin");
                request.SetRequestHeader("X-Plugin-Version", Version.ToString());
                request.SetRequestHeader("storeId", _config.GameStores.ShopID);
                request.SetRequestHeader("secretKey", _config.GameStores.SecretKey);
                request.SetRequestHeader("serverId", _config.GameStores.ServerID);

                yield return request.SendWebRequest();

                if (Instance == null) yield break;

                var response = request.downloadHandler != null ? request.downloadHandler.text : string.Empty;

                callback((int)request.responseCode, response);
            }
        }

        private void RequestRemoteBasket(BasePlayer player)
        {
            if (_remoteLoading.Contains(player.userID)) return;

            _remoteLoading.Add(player.userID);

            GS_Request("baskets.bySteamId", new Dictionary<string, string> { { "steamId", player.UserIDString } },
                (code, response) =>
                {
                    _remoteLoading.Remove(player.userID);

                    var items = new List<BasketItem>();

                    try
                    {
                        if (code == 200 || code == 400)
                        {
                            var json = JObject.Parse(response);
                            if (json["result"] != null && json["result"].ToString() == "success")
                            {
                                var data = json["data"] as JArray;
                                if (data != null)
                                    foreach (var element in data)
                                    {
                                        var item = ParseRemoteItem(element as JObject);
                                        if (item != null) items.Add(item);
                                    }
                            }
                        }
                    }
                    catch (Exception e)
                    {
                        PrintError($"Ошибка получения корзины GameStores: {e.Message}");
                    }

                    _remoteBaskets[player.userID] = items;

                    if (IsMenuOpen(player) && GetTab(player) == TabBasket)
                        OpenMenu(player, TabBasket, false, false);
                });
        }

        private BasketItem ParseRemoteItem(JObject element)
        {
            if (element == null) return null;

            var item = new BasketItem
            {
                Source = SourceGameStores,
                RemoteId = element["basketId"] != null ? element["basketId"].ToString() : string.Empty,
                ProductId = element["productId"] != null ? element["productId"].ToString() : string.Empty,
                Name = element["name"] != null ? element["name"].ToString() : string.Empty,
                Image = element["img"] != null ? element["img"].ToString() : string.Empty,
                Amount = element["amount"] != null ? Convert.ToInt32(element["amount"].ToString()) : 1
            };

            var type = element["type"] != null ? element["type"].ToString() : "item";

            item.Type = type == "bp" ? "blueprint" : type;

            var data = element["data"] as JObject;
            if (data != null)
            {
                if (item.IsCommand)
                {
                    var commands = data["commands"] as JArray;
                    if (commands != null)
                        foreach (var command in commands)
                            item.Commands.Add(command.ToString());
                }
                else
                {
                    var itemId = data["itemId"];
                    if (itemId != null)
                    {
                        var definition = ItemManager.FindItemDefinition(Convert.ToInt32(itemId.ToString()));
                        if (definition != null) item.Shortname = definition.shortname;
                    }
                }
            }

            if (string.IsNullOrEmpty(item.RemoteId)) return null;

            if (!string.IsNullOrEmpty(item.Image)) AddImage(item.Image, ImageKey(item.Image));

            return item;
        }

        private void TakeRemoteItem(BasePlayer player, string basketId)
        {
            List<BasketItem> remote;
            if (!_remoteBaskets.TryGetValue(player.userID, out remote) || remote == null)
            {
                ShowNotify(player, Msg(player, MsgItemNotFound));
                return;
            }

            var item = remote.FirstOrDefault(x => x.RemoteId == basketId);
            if (item == null)
            {
                ShowNotify(player, Msg(player, MsgItemNotFound));
                return;
            }

            ShowNotify(player, Msg(player, MsgProcessing));

            GS_Request("baskets.makeIssued", new Dictionary<string, string>
            {
                { "steamId", player.UserIDString },
                { "basketId", basketId }
            }, (code, response) =>
            {
                var success = false;

                try
                {
                    if (code == 200 || code == 400)
                    {
                        var json = JObject.Parse(response);
                        success = json["result"] != null && json["result"].ToString() == "success";
                    }
                }
                catch (Exception e)
                {
                    PrintError($"Ошибка выдачи товара GameStores: {e.Message}");
                }

                if (!success)
                {
                    ShowNotify(player, Msg(player, MsgBuyError));
                    return;
                }

                string error;
                if (!GiveItem(player, item, out error))
                {
                    ShowNotify(player, error);
                    return;
                }

                remote.Remove(item);

                if (IsMenuOpen(player)) OpenMenu(player, TabBasket, false, false);
            });
        }

        #endregion

        #region Images

        private void LoadImages()
        {
            if (ImageLibrary == null || !ImageLibrary.IsLoaded) return;

            var images = new Dictionary<string, string>();

            foreach (var product in _config.Products)
                if (IsUrl(product.Image))
                    images[ImageKey(product.Image)] = product.Image;

            if (IsUrl(_config.CurrencyIcon)) images[ImageKey(_config.CurrencyIcon)] = _config.CurrencyIcon;
            if (IsUrl(_config.UI.StoreIcon)) images[ImageKey(_config.UI.StoreIcon)] = _config.UI.StoreIcon;
            if (IsUrl(_config.UI.BasketIcon)) images[ImageKey(_config.UI.BasketIcon)] = _config.UI.BasketIcon;

            if (images.Count == 0) return;

            ImageLibrary.Call("ImportImageList", Title, images, 0UL, true);
        }

        private void AddImage(string url, string key)
        {
            if (ImageLibrary == null || !ImageLibrary.IsLoaded || !IsUrl(url)) return;

            if (Convert.ToBoolean(ImageLibrary.Call("HasImage", key))) return;

            ImageLibrary.Call("AddImage", url, key, 0UL);
        }

        private string GetImage(string key)
        {
            if (ImageLibrary == null || !ImageLibrary.IsLoaded) return string.Empty;

            return Convert.ToString(ImageLibrary.Call("GetImage", key));
        }

        private static string ImageKey(string url)
        {
            return $"GSM_{url.GetHashCode()}";
        }

        private static bool IsUrl(string source)
        {
            return !string.IsNullOrEmpty(source) && source.StartsWith("http", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsSprite(string source)
        {
            return !string.IsNullOrEmpty(source) &&
                   (source.EndsWith(".png") || source.EndsWith(".psd") || source.EndsWith(".tga") ||
                    source.EndsWith(".mat"));
        }

        private string GetProductImage(Configuration.ProductConfig product)
        {
            if (!string.IsNullOrEmpty(product.Image)) return product.Image;

            if (product.IsBlueprint) return "blueprintbase";

            return product.Shortname;
        }

        private string GetBasketImage(BasketItem item)
        {
            if (!string.IsNullOrEmpty(item.Image)) return item.Image;

            if (item.IsBlueprint) return "blueprintbase";

            return item.Shortname;
        }

        /// <summary>
        ///     Источником картинки может быть ссылка, спрайт игры или shortname предмета
        /// </summary>
        private ICuiComponent GetImageComponent(string source, string color)
        {
            if (string.IsNullOrEmpty(source))
                return new CuiImageComponent { Color = "0 0 0 0" };

            if (IsUrl(source))
            {
                var key = ImageKey(source);
                var png = GetImage(key);

                if (!string.IsNullOrEmpty(png) && png != "0")
                    return new CuiRawImageComponent { Png = png, Color = color };

                return new CuiRawImageComponent { Url = source, Color = color };
            }

            if (IsSprite(source))
                return new CuiImageComponent { Sprite = source, Color = color };

            var definition = ItemManager.FindItemDefinition(source);
            if (definition != null)
                return new CuiImageComponent { ItemId = definition.itemid, Color = color };

            return new CuiImageComponent { Color = "0 0 0 0" };
        }

        #endregion

        #region Helpers

        private static double CurrentTime()
        {
            return DateTime.UtcNow.Subtract(new DateTime(1970, 1, 1)).TotalSeconds;
        }

        #endregion

        #region Lang

        private const string
            MsgTopUp = "TopUp",
            MsgYourItems = "YourItems",
            MsgRefresh = "Refresh",
            MsgBasketEmpty = "BasketEmpty",
            MsgStoreEmpty = "StoreEmpty",
            MsgLoading = "Loading",
            MsgStockLeft = "StockLeft",
            MsgTake = "Take",
            MsgFromStore = "FromStore",
            MsgBuy = "Buy",
            MsgCancel = "Cancel",
            MsgConfirmTitle = "ConfirmTitle",
            MsgConfirmDescription = "ConfirmDescription",
            MsgNoMoney = "NoMoney",
            MsgNoPermission = "NoPermission",
            MsgOutOfStock = "OutOfStock",
            MsgProductNotFound = "ProductNotFound",
            MsgItemNotFound = "ItemNotFound",
            MsgBuyError = "BuyError",
            MsgBoughtToBasket = "BoughtToBasket",
            MsgReceived = "Received",
            MsgReceivedFeet = "ReceivedFeet",
            MsgReceivedCommand = "ReceivedCommand",
            MsgProcessing = "Processing",
            MsgDeadOrWounded = "DeadOrWounded",
            MsgBuildingBlocked = "BuildingBlocked";

        protected override void LoadDefaultMessages()
        {
            lang.RegisterMessages(new Dictionary<string, string>
            {
                [MsgTopUp] = "You can top up your balance in our store: {0}",
                [MsgYourItems] = "Your items",
                [MsgRefresh] = "REFRESH",
                [MsgBasketEmpty] = "Your cart is empty",
                [MsgStoreEmpty] = "No products configured",
                [MsgLoading] = "Loading...",
                [MsgStockLeft] = "Left {0}",
                [MsgTake] = "TAKE",
                [MsgFromStore] = "From store",
                [MsgBuy] = "BUY",
                [MsgCancel] = "CANCEL",
                [MsgConfirmTitle] = "PURCHASE CONFIRMATION",
                [MsgConfirmDescription] = "Buy «{0}» for {1} {2}?",
                [MsgNoMoney] = "Not enough funds! You need {0} more",
                [MsgNoPermission] = "This product is not available to you!",
                [MsgOutOfStock] = "This product is out of stock!",
                [MsgProductNotFound] = "Product not found!",
                [MsgItemNotFound] = "Item not found!",
                [MsgBuyError] = "An error occurred, please try again later!",
                [MsgBoughtToBasket] = "«{0}» purchased! Pick it up in the «Your items» tab",
                [MsgReceived] = "You received «{0}»",
                [MsgReceivedFeet] = "You received «{0}», there was no space in your inventory — dropped at your feet!",
                [MsgReceivedCommand] = "You received «{0}»",
                [MsgProcessing] = "Please wait, your request is being processed...",
                [MsgDeadOrWounded] = "You cannot pick up items while dead or wounded!",
                [MsgBuildingBlocked] = "You cannot pick up items in a building blocked zone!"
            }, this);

            lang.RegisterMessages(new Dictionary<string, string>
            {
                [MsgTopUp] = "Пополнить баланс вы можете в нашем магазине: {0}",
                [MsgYourItems] = "Ваши предметы",
                [MsgRefresh] = "ОБНОВИТЬ",
                [MsgBasketEmpty] = "Ваша корзина пуста",
                [MsgStoreEmpty] = "Товары не настроены",
                [MsgLoading] = "Загрузка...",
                [MsgStockLeft] = "Осталось {0}",
                [MsgTake] = "ЗАБРАТЬ",
                [MsgFromStore] = "Из магазина",
                [MsgBuy] = "КУПИТЬ",
                [MsgCancel] = "ОТМЕНА",
                [MsgConfirmTitle] = "ПОДТВЕРЖДЕНИЕ ПОКУПКИ",
                [MsgConfirmDescription] = "Купить «{0}» за {1} {2}?",
                [MsgNoMoney] = "Недостаточно средств! Не хватает {0}",
                [MsgNoPermission] = "Этот товар вам недоступен!",
                [MsgOutOfStock] = "Этот товар закончился!",
                [MsgProductNotFound] = "Товар не найден!",
                [MsgItemNotFound] = "Предмет не найден!",
                [MsgBuyError] = "Произошла ошибка, попробуйте позже!",
                [MsgBoughtToBasket] = "Товар «{0}» куплен! Заберите его во вкладке «Ваши предметы»",
                [MsgReceived] = "Вы получили «{0}»",
                [MsgReceivedFeet] = "Вы получили «{0}», в инвентаре не было места — предмет брошен под ноги!",
                [MsgReceivedCommand] = "Вы получили «{0}»",
                [MsgProcessing] = "Подождите, ваш запрос обрабатывается...",
                [MsgDeadOrWounded] = "Вы не можете забрать товар будучи мёртвым или нокнутым!",
                [MsgBuildingBlocked] = "Вы не можете забрать товар в зоне блокировки строительства!"
            }, this, "ru");
        }

        private string Msg(BasePlayer player, string key, params object[] args)
        {
            var message = lang.GetMessage(key, this, player != null ? player.UserIDString : null);

            return args.Length > 0 ? string.Format(message, args) : message;
        }

        private void Reply(BasePlayer player, string key, params object[] args)
        {
            player.ChatMessage(Msg(player, key, args));
        }

        #endregion

        #region API

        private double API_GetBalance(ulong userId)
        {
            return GetBalanceSync(userId);
        }

        private void API_AddBalance(ulong userId, int amount)
        {
            Deposit(userId, amount, success => { });
        }

        private bool API_GiveProduct(ulong userId, string productId)
        {
            var product = FindProduct(productId);
            if (product == null) return false;

            AddToBasket(userId, product);

            var player = BasePlayer.FindByID(userId);
            if (player != null && IsMenuOpen(player)) OpenMenu(player, GetTab(player), false);

            return true;
        }

        private int API_GetBasketCount(ulong userId)
        {
            return GetPlayerInfo(userId).Items.Count;
        }

        #endregion
    }
}
