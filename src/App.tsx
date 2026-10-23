import { Routes, Route } from 'react-router'
import { Toaster } from './components/ui/sonner'
import Home from './pages/Home'
import Online from './pages/Online'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/online" element={<Online />} />
      </Routes>
      <Toaster position="top-center" />
    </>
  )
}
