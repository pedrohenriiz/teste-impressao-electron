import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

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

  ipcMain.handle('print-pdf-base64', async (_, base64: string) => {
  
    try {
    base64 = base64.replace(/^data:application\/pdf;base64,/, '')

    const printWidthMM = 72

    const html = `
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          @page { margin: 0 !important; size: 80mm auto; }
          html, body { 
            margin: 0 !important; 
            padding: 0 !important; 
            width: ${printWidthMM}mm;
          }
          img {
            width: ${printWidthMM}mm;
            display: block;
          }
          #container {
            width: ${printWidthMM}mm;
            margin: 0;
            padding: 0;
          }
        </style>
      </head>
      <body>
        <div id="container"></div>
        <script type="module">
          const pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
          
          const base64 = '${base64}';
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          
          const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
          const container = document.getElementById('container');
          
          const imgPromises = [];
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const scale = 4;
            const viewport = page.getViewport({ scale });
            
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            await page.render({
              canvasContext: canvas.getContext('2d'),
              viewport
            }).promise;
            
            const img = document.createElement('img');
            const loadPromise = new Promise(r => { img.onload = r; });
            img.src = canvas.toDataURL('image/png');
            container.appendChild(img);
            imgPromises.push(loadPromise);
          }
          
          // Espera TODAS as imagens carregarem
          await Promise.all(imgPromises);
          await new Promise(r => setTimeout(r, 300));
          
          const h = container.scrollHeight;
          const w = container.scrollWidth;
          document.title = 'READY_' + w + '_' + h;
        </script>
      </body>
    </html>
  `

    const win = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: false }
    })

    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)

    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (win.getTitle().startsWith('READY_')) {
          clearInterval(check)
          setTimeout(resolve, 500)
        }
      }, 100)
      setTimeout(() => { clearInterval(check); resolve() }, 10000)
    });

    // const title = win.getTitle()
    // console.log('Dimensões do conteúdo:', title)

     // Pega dimensões reais do título
    const parts = win.getTitle().split('_')
    const contentWidth = parseInt(parts[1])
    const contentHeight = parseInt(parts[2])

    // Converte px para mm (96dpi: 1px = 0.2646mm)
    const heightMM = Math.ceil(contentHeight * 0.2646) + 5 // +5mm segurança

    // Converte mm para microns
    const widthMicrons = printWidthMM * 1000
    const heightMicrons = heightMM * 1000

    console.log(`Imprimindo: ${printWidthMM}mm x ${heightMM}mm`)

    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: 'Nome_Da_Sua_Impressora_Termica',
          margins: { marginType: 'none' },
          scaleFactor: 100,
          pageSize: { width: widthMicrons, height: heightMicrons }
        },
        (success, errorType) => {
          if (!success) reject(new Error(errorType))
          else resolve()
        }
      )
    })

    win.close()
    return true

  } catch (error) {
    console.error('Erro ao imprimir PDF:', error)
    return false
  }
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
