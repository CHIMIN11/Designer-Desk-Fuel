-- DEMO data for local development and admin-dashboard previews ONLY.
-- Every row is is_demo = true and prefixed "DEMO". list_public_spaces() excludes
-- is_demo rows and admin_set_publication() refuses to publish them, so they can
-- never appear in the public directory. These are not real businesses.
insert into public.spaces
  (business_name, address, city, district, category, price_range, opening_hours, wifi_available,
   power_outlets, seating_information, contact_email, is_demo, authorization_status, publication_status)
values
  ('DEMO 空間 A（非真實店家）', 'DEMO 地址，非真實地址', '台北市', '中山區', 'cafe', '200_400', 'DEMO 09:00-20:00',
   true, 'some', 'DEMO：單人座 8 席', 'demo@example.invalid', true, 'pending', 'draft'),
  ('DEMO 空間 B（非真實店家）', 'DEMO 地址，非真實地址', '桃園市', '中壢區', 'studio', 'under_200', 'DEMO 13:00-21:00',
   true, 'most', 'DEMO：大桌面 4 張', 'demo@example.invalid', true, 'pending', 'draft');
