/* A member's profile photograph, as a round avatar, or their initials when they have none.

   The picture is read through this console's own server (GET /api/people/:id/photo), so the permission check runs and nothing
   public is involved. One read per member per page visit: the answer, including "no photograph", is kept for the life of the page. */

import { useEffect, useState } from 'react';
import { apiUrl, getToken } from '@/lib/api';
import { Avatar } from '@/components/ui';

const seen = new Map<string, Promise<string | null>>();

function photoUrl(memberId: string): Promise<string | null> {
  let hit = seen.get(memberId);
  if (!hit) {
    hit = fetch(apiUrl(`/people/${memberId}/photo`), { headers: { authorization: 'Bearer ' + getToken() } })
      .then(async (res) => (res.ok ? URL.createObjectURL(await res.blob()) : null))
      .catch(() => null);
    seen.set(memberId, hit);
  }
  return hit;
}

/** Forget what was read, e.g. after signing out, so the next person to sign in is not shown what the last one could see. */
export const forgetMemberPhotos = () => {
  seen.forEach((p) => p.then((u) => u && URL.revokeObjectURL(u)));
  seen.clear();
};

export function MemberPhoto({ id, name, size }: { id?: string | null; name: string; size?: 'sm' | 'lg' }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setSrc(null);
    if (id) photoUrl(String(id)).then((u) => { if (live) setSrc(u); });
    return () => { live = false; };
  }, [id]);
  if (!src) return <Avatar name={name} size={size} />;
  return <img src={src} alt="" className={'av' + (size ? ' ' + size : '')} style={{ objectFit: 'cover' }} onError={() => setSrc(null)} />;
}
