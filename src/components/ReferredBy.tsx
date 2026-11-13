/* Who referred a member, as they gave it when registering, and whether that
   person is already in Noah: a green tick when their number belongs to a member,
   a red cross when it does not. A name alone is not taken as proof, so a member
   with the same name but another number is only mentioned. */

import { Chip } from '@/components/ui';

interface Brief { rowId: string; name: string; memberId: string; archived?: boolean }
export interface Referrer {
  name: string; phone: string; inNoah: boolean;
  member: Brief | null; sameName: Brief[];
}

export function ReferredBy({ referrer, phone, fallback }: { referrer?: Referrer | null; phone?: string; fallback?: string }) {
  /* Without the Catalyst tables there is no check, only what they wrote. */
  if (referrer === undefined && fallback) return <span>{fallback}</span>;
  if (!referrer) return <span className="muted">Not given</span>;
  const shown = phone || referrer.phone;
  return (
    <div>
      <div className="row wrap gap6" style={{ alignItems: 'center' }}>
        <b>{referrer.name || 'No name given'}</b>
        {shown && <span className="mono">{shown}</span>}
        {referrer.inNoah
          ? <Chip tone="ok" icon="check">Noah member</Chip>
          : <Chip tone="bad" icon="x">Not a Noah member</Chip>}
      </div>
      {referrer.member && (
        <div className="small muted mt4">
          {referrer.member.name} · member number <span className="mono">{referrer.member.memberId}</span>
          {referrer.member.archived ? ' · archived' : ''}
        </div>
      )}
      {!referrer.inNoah && referrer.sameName.length > 0 && (
        <div className="small muted mt4">
          Same name, different number: {referrer.sameName.map((m) => `${m.name} (${m.memberId})`).join(', ')}
        </div>
      )}
    </div>
  );
}
