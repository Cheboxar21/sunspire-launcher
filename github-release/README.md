# Sunspire — Retro Minecraft Launcher

**Sunspire** — ретро-лаунчер Minecraft на **Rust / Tauri 2** с настоящей лицензией Microsoft,
офлайн-профилями, каталогом Modrinth, сборками, модами, темами и Discord Rich Presence.

> **Релиз на GitHub — совсем скоро.** Установщик, ролик и обложки уже готовы;
> ссылка на скачивание появится здесь, как только репозиторий будет опубликован.

![Sunspire](cover-wide.png)

## Скачать

- **Windows 10/11, x64**
- Установщик: `Sunspire-Setup.exe` — **12 MB**
- Бесплатно. Без регистрации и подписок.
- Ссылка на GitHub-релиз: **скоро**.

SHA-256 установщика: см. `SHA256SUMS.txt` (появится вместе с релизом).

## Motion Preview

[![Sunspire Motion Preview](cover.png)](Sunspire-Motion-Preview.mp4)

Вертикальный ролик 1080×1920, 36 секунд, 30 FPS, ретро-электронный саундтрек.
Подходит для TikTok / Reels / Shorts.

## Возможности

- **Microsoft OAuth 2.0** — настоящий аккаунт, скины и доступ к лицензионным серверам.
- **Офлайн-профили** — ник, скин, игра без интернета.
- **Modrinth** — моды, модпаки, ресурспаки и шейдеры. Поиск, версии, установка в один клик.
- **Сборки** — Fabric, Quilt, Forge, NeoForge, Vanilla. RAM, Java, аргументы, папка сборки.
- **Моды** — включение/выключение, удаление, локальные `.jar`, сканирование папки.
- **5 тем** — Acid, Amber, Cyan, Magenta, Mono.
- **Discord Rich Presence** — «в лаунчере», «в игре», одиночная игра или сервер.
- **Трей** — закрытие окна прячет лаунчер, игра и загрузки продолжаются.
- **Автообновление** — проверка `latest.json` / GitHub Releases и тихая установка.
- **Ретро-интерфейс** — CRT, фосфор, пиксельный шрифт, сканлайны, но настоящий Minecraft.

## Установка

1. Дождитесь публикации релиза на GitHub.
2. Скачайте `Sunspire-Setup.exe`.
3. Запустите установщик (Windows SmartScreen может предупредить, если сборка не подписана:
   **Подробнее → Выполнить всё равно**).
4. Установка для текущего пользователя, без UAC.
5. Запустите **Sunspire** из меню «Пуск» или с рабочего стола.
6. Войдите через Microsoft или создайте офлайн-профиль.

Данные: `%APPDATA%\Sunspire` (сборки, Java, логи, состояние).

## Сборка из исходников

Нужны Node.js 20+, Rust stable (GNU или MSVC), MinGW `dlltool` для GNU-таргета.

```bat
npm install
npm run tauri:build
```

Установщик появится в `src-tauri/target/release/bundle/nsis/`.

## Discord Rich Presence

В комплекте используется Discord-приложение **Sunspire** (`1570081050732793906`).
В **Настройки → Интерфейс** можно указать свой Application ID.

Для своей иконки в Rich Presence:

1. Создайте приложение в <https://discord.com/developers/applications>.
2. Загрузите `logo.png` как App Icon.
3. Rich Presence → Assets → загрузите `logo.png` с ключом **`logo`**.
4. Вставьте Application ID в настройки лаунчера.

## Музыка и видео

Музыка синтезирована специально для этого ролика (без сторонних сэмплов).
Видео и музыку можно свободно распространять вместе с проектом; желательно указывать
авторство **Sunspire**.

## Лицензия

Код лаунчера — MIT. Minecraft является торговой маркой Mojang Studios.
Проект не связан с Mojang, Microsoft или Modrinth.

## Ссылки

- Modrinth: <https://modrinth.com>
- Minecraft: <https://www.minecraft.net>
- GitHub: **репозиторий и релиз скоро**
