import Versions from './components/Versions'
import electronLogo from './assets/electron.svg'

function App(): React.JSX.Element {
  const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')

  const print = async () => {
    await window.api.previewReceipt()
  }

  const imprimir = async () => {
    const base64Image = ''

    await window.api.printBase64Pdf(base64Image)
  }

  return (
    <>
      <button onClick={imprimir}>Imprimir cupom</button>
    </>
  )
}

export default App
