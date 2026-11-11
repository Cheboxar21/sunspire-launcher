import { useEffect, useState } from 'react';
import { Account, SkinData } from '../types';
import { api } from './api';

const fallback: SkinData = {
  skinDataUrl: '/assets/steve.png',
  capeDataUrl: null,
  slimArms: false
};

export function useSkinData(account: Account | null, revision = 0): SkinData {
  const [data, setData] = useState<SkinData>(() => {
    if (account && account.skinDataUrl) {
      return {
        skinDataUrl: account.skinDataUrl,
        capeDataUrl: null,
        slimArms: account.slimArms
      };
    }
    return {
      ...fallback,
      skinDataUrl: account && account.slimArms ? '/assets/alex.png' : '/assets/steve.png',
      slimArms: Boolean(account && account.slimArms)
    };
  });

  useEffect(() => {
    let cancelled = false;
    if (!account) {
      setData(fallback);
      return () => {
        cancelled = true;
      };
    }
    const local =
      account.skinDataUrl ||
      (account.slimArms ? '/assets/alex.png' : '/assets/steve.png');
    setData((current) => ({
      ...current,
      skinDataUrl: local,
      slimArms: account.slimArms
    }));
    api.auth
      .getSkin(account.id)
      .then((result) => {
        if (cancelled || !result) return;
        setData({
          skinDataUrl: result.skinDataUrl || local,
          capeDataUrl: result.capeDataUrl,
          slimArms: result.slimArms
        });
      })
      .catch(() => {
        // keep local fallback
      });
    return () => {
      cancelled = true;
    };
  }, [account?.id, account?.slimArms, account?.skinDataUrl, revision]);

  return data;
}
