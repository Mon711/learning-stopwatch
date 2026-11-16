'use client';
import {useEffect,useState} from 'react';
import {Moon,Sun} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {themeStorageKey} from '@/lib/theme';

export default function ThemeToggle(){
 const [dark,setDark]=useState(false);
 useEffect(()=>{setDark(document.documentElement.dataset.theme==='dark');},[]);
 function toggle(){
  const next=!dark;setDark(next);
  document.documentElement.dataset.theme=next?'dark':'light';
  try{localStorage.setItem(themeStorageKey,next?'dark':'light');}catch{}
 }
 return <Button variant="outline" className="theme-toggle" onClick={toggle} aria-label="Dark mode" aria-pressed={dark}>{dark?<Sun size={16}/>:<Moon size={16}/>}<span>{dark?'Light mode':'Dark mode'}</span></Button>;
}
