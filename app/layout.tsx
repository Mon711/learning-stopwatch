import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Learning Stopwatch',description:'Time your learning sessions. Pause, resume, and keep a simple record of progress.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
