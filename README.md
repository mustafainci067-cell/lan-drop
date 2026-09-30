# LAN-Drop 🚀

> Because AirDrop doesn't work between everything.

Ever got annoyed that you can't just quickly send a photo or a video from your phone to your Windows PC without emailing it to yourself, logging into WhatsApp Web, or digging up a cable? Yeah, me too.

That's exactly why I built **LAN-Drop**.

LAN-Drop is a dead-simple, cross-platform file transfer tool. It runs on your local network, meaning no cloud servers, no internet bandwidth used, and zero privacy concerns. It's just your devices talking directly to each other at the maximum speed your router can handle.

## ✨ How it works
1. **Open LAN-Drop on your PC.**
2. **Scan the QR Code** with your phone (no app download required on the phone!).
3. **Enter the 6-digit PIN** shown on the PC screen (just to make sure nobody else on the cafe Wi-Fi is sending you weird stuff).
4. **Select your files** and watch them transfer instantly to your PC.

That's it. It’s basically AirDrop, but for Windows and literally any smartphone.

## 🛠 Features
- **Zero Configuration:** No IP addresses to type, no network settings to mess with. Just scan the QR.
- **Privacy First:** Completely offline. Files never leave your local network.
- **Blazing Fast:** Uses raw TCP over your local LAN. Speeds are only limited by your Wi-Fi router.
- **Secure:** A dynamically generated 6-digit PIN ensures only you can upload files to your machine.
- **Cross-Platform Client:** The sender uses a lightweight web interface built with Next.js, meaning it works on iOS, Android, macOS, or any device with a modern browser.

## 💻 Tech Stack (The fun part)
The architecture is a bit overkill, but I wanted it to be blazing fast and robust:
- **Frontend / Client UI:** [Next.js](https://nextjs.org/) (React, TailwindCSS)
- **Desktop Wrapper:** [Electron](https://www.electronjs.org/) (to make it feel like a native desktop app)
- **Backend / File Server:** Java with [Javalin](https://javalin.io/) (Because handling massive multi-gigabyte file streams in Node.js can be a headache, Java handles the heavy lifting gracefully).

## 🚀 Getting Started

If you just want to use the app, head over to the **[Releases](https://github.com/mustafainci067-cell/lan-drop/releases)** tab and download the latest `.exe` setup file. Install it, and you're good to go.

### Building from Source
If you want to tinker with the code:

1. **Clone the repo**
   ```bash
   git clone https://github.com/mustafainci067-cell/lan-drop.git
   cd lan-drop
   ```
2. **Build the Java Backend**
   Make sure you have JDK 21+ and Maven installed.
   ```bash
   mvn clean package
   ```
3. **Run the Next.js/Electron App**
   ```bash
   cd frontend
   npm install
   npm run electron:dev
   ```

## 🤝 Contributing
Feel free to open issues, submit pull requests, or just drop a star if you find this useful! I'm planning to add system tray integration and a native "Accept/Reject" prompt soon.

## 📜 License
MIT License. Do whatever you want with it!
