import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app'
import './styles.css'

if (import.meta.env.DEV) {
  // Console access to the live instances for debugging: __mpc.useMpc.getState(), __mpc.engine…
  void Promise.all([
    import('./state/store'),
    import('./audio/engine'),
    import('./audio/transport'),
    import('./audio/bounce'),
  ]).then(([store, engine, transport, bounce]) => {
    Object.assign(window, {
      __mpc: {
        useMpc: store.useMpc,
        engine: engine.engine,
        transport: transport.transport,
        bounce: bounce.bounce,
      },
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
