import { Routes, Route } from 'react-router'
import { Toaster } from './components/ui/sonner'
import Home from './pages/Home'
import Online from './pages/Online'
import TicTacToe from './pages/TicTacToe'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/online" element={<Online />} />
        <Route path="/tic-tac-toe" element={<TicTacToe />} />
      </Routes>
      <Toaster position="top-center" />
    </>
  )
}
