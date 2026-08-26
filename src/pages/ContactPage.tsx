import { useState } from 'react';
import { Mail, MapPin, Phone, Send } from 'lucide-react';
import { useToast } from '@/components/useToast';
import { BackButton } from '@/components/BackButton';
import { useSiteSettings } from '@/lib/siteSettings';
import { supabase } from '@/lib/supabase';

export function ContactPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [loading, setLoading] = useState(false);
  const { settings } = useSiteSettings();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.from('contact_messages').insert({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      message: form.message.trim(),
    });
    setLoading(false);
    if (error) { toast('Could not send your message. Please use the contact email instead.', 'error'); return; }
    toast('Message sent. We\'ll be in touch soon.');
    setForm({ name: '', email: '', message: '' });
  };

  return (
    <div className="container-content py-12">
      <BackButton to="/" />
      <h1 className="mt-4 font-display text-3xl font-bold text-ink-900">Contact us</h1>
      <p className="mt-2 text-ink-600">Questions, feedback or need help? Reach out.</p>
      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <a href={`mailto:${settings.admin_contact_email}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-ink-50"><Mail className="h-5 w-5 text-brand-600" /><div><p className="text-sm font-medium text-ink-900">Email</p><p className="text-sm text-ink-500">{settings.admin_contact_email}</p></div></a>
          <a href={`tel:${settings.admin_contact_phone.replace(/\s/g, '')}`} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-ink-50"><Phone className="h-5 w-5 text-brand-600" /><div><p className="text-sm font-medium text-ink-900">Phone</p><p className="text-sm text-ink-500">{settings.admin_contact_phone}</p></div></a>
          <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-brand-600" /><div><p className="text-sm font-medium text-ink-900">Address</p><p className="text-sm text-ink-500">Nairobi, Kenya</p></div></div>
        </div>
        <form onSubmit={submit} className="card p-6">
          <div><label className="label">Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" required /></div>
          <div className="mt-4"><label className="label">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" required /></div>
          <div className="mt-4"><label className="label">Message</label><textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} rows={4} className="input" required /></div>
          <button type="submit" disabled={loading} className="btn-primary mt-4 w-full">{loading ? 'Sending…' : 'Send message'} <Send className="h-4 w-4" /></button>
        </form>
      </div>
    </div>
  );
}
