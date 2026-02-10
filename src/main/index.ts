import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

import { writeFile } from 'fs/promises'
import { tmpdir } from 'os'

import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('preview-receipt', async () => {
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: false
      }
    })

    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      // DEV → servidor Vite
      await printWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/print.html`)
    } else {
      // PROD → arquivo físico
      await printWindow.loadFile(join(__dirname, '../renderer/print.html'))
    }

    const pdfBuffer = await printWindow.webContents.printToPDF({
      printBackground: true,
      marginsType: 1
    })

    const filePath = join(tmpdir(), `cupom-${Date.now()}.pdf`)
    await writeFile(filePath, pdfBuffer)
    await shell.openPath(filePath)

    printWindow.close()
  })

  ipcMain.handle('print-base64', async (_, base64: string) => {
    // 🔴 GARANTE que é uma imagem válida
    if (!base64.startsWith('data:image')) {
      throw new Error('Base64 da imagem inválido')
    }

    const html = `
    <html>
      <head>
        <style>
          @page { margin: 0 }
          body {
            margin: 0;
            width: 80mm;
          }
          img {
            width: 100%;
          }
        </style>
      </head>
      <body>
        <img src="${base64}" />
      </body>
    </html>
  `

    const win = new BrowserWindow({
      show: true,
      webPreferences: { sandbox: false }
    })

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    // ✅ ESPERA HTML + IMAGEM CARREGAREM
    await new Promise<void>((resolve) => {
      win.webContents.once('did-finish-load', () => {
        // espera um frame extra para a imagem renderizar
        setTimeout(resolve, 300)
      })
    })

    // ✅ IMPRIME E SÓ FECHA DEPOIS
    win.webContents.print(
      {
        silent: true,
        printBackground: true,
        margins: { marginType: 'none' }
      },
      () => {
        win.close()
      }
    )
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
