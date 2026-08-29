-- Owner-adjustable screen background: solid (default, clean white/black) or a
-- wallpaper backdrop with an adjustable blur percentage. Global (app_settings
-- already holds company branding, single row id=1, head-only write).
alter table public.app_settings
  add column if not exists bg_style text not null default 'solid'
    check (bg_style in ('solid', 'wallpaper')),
  add column if not exists bg_blur int not null default 40
    check (bg_blur between 0 and 100);
