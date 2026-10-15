const base = `${import.meta.env.BASE_URL}assets/png/default/ui`;

export const iconUrl = (name: string) => `${base}/controls/${name}.png`;
export const hudIconUrl = (name: string) => `${base}/hud/${name}.png`;
export const menuArtUrl = (name: string) => `${base}/menu/${name}.png`;
