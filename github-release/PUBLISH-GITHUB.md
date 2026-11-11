# Как выложить на GitHub

Релиз пока не опубликован — и видео, и README честно говорят «скоро».
Когда репозиторий будет готов:

1. Создайте репозиторий, например `sunspire` (можно приватный, но для скачивания нужен публичный).
2. Замените `СКОРО НА GITHUB` в `video/motion.html` (константа `GITHUB_URL`) на свой URL
   и перерендерите ролик: `node scripts/render-video.cjs`, затем `node scripts/finish-video.cjs`.
3. Обновите ссылки в `README.md` и `TikTok-Caption.txt`.
4. Загрузите в репозиторий:
   - `README.md`
   - `cover.png`, `cover-wide.png`
   - `Sunspire-Motion-Preview.mp4`
   - `Sunspire-Setup.exe`
   - `SHA256SUMS.txt`
5. Создайте **Release** (например, `v1.0.0`) и прикрепите:
   - `Sunspire-Setup.exe`
   - `Sunspire-Motion-Preview.mp4`
   - `SHA256SUMS.txt`
6. В описании релиза используйте текст из `RELEASE-NOTES.md`.
7. Ссылку на релиз вставьте в описание TikTok.

## Через GitHub CLI

```powershell
winget install GitHub.cli
gh auth login
gh release create v1.0.0 `
  .\Sunspire-Setup.exe `
  .\Sunspire-Motion-Preview.mp4 `
  .\SHA256SUMS.txt `
  --title "Sunspire 1.0.0" `
  --notes-file .\RELEASE-NOTES.md
```

## Проверка

```powershell
Get-FileHash .\Sunspire-Setup.exe -Algorithm SHA256
Get-FileHash .\Sunspire-Motion-Preview.mp4 -Algorithm SHA256
```

Файл `SHA256SUMS.txt` должен совпадать с этими хешами.
