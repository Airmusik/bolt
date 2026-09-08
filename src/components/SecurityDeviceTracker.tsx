import { useEffect } from 'react';
import { useAuth } from '@/lib/useAuth';
import { useSiteSettings } from '@/lib/siteSettings';
import { supabase } from '@/lib/supabase';
export function SecurityDeviceTracker(){const{user}=useAuth();const{settings}=useSiteSettings();useEffect(()=>{if(!user||settings.security_new_device_alerts!=='true')return;let active=true;void(async()=>{let id=localStorage.getItem('11drive-device-id');if(!id){id=crypto.randomUUID();localStorage.setItem('11drive-device-id',id)}const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${id}:${user.id}`));const hash=Array.from(new Uint8Array(bytes)).map(value=>value.toString(16).padStart(2,'0')).join('');if(active)await supabase.rpc('register_security_device',{p_hash:hash,p_label:navigator.platform||'Browser'})})();return()=>{active=false}},[user,settings.security_new_device_alerts]);return null}
