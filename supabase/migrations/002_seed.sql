-- ============================================================
-- TableKey – Demo Seed Data
-- One venue: "The Rustic Fork" – 6 tables, full menu
-- ============================================================

-- Venue
insert into venues (id, name, slug, address, phone, currency, timezone, kitchen_open, allow_cash, allow_card)
values (
  'a1b2c3d4-0000-0000-0000-000000000001',
  'The Rustic Fork',
  'rustic-fork',
  '42 Elm Street, Portland, OR 97201',
  '+1 503-555-0142',
  'USD',
  'America/Los_Angeles',
  true,
  true,
  true
);

-- Tables (6)
insert into restaurant_tables (id, venue_id, table_number, label, capacity, qr_token) values
  ('b1000000-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000001', '1', 'Main Floor', 4, 'qr-table-1-demo-token-aaa'),
  ('b1000000-0000-0000-0000-000000000002', 'a1b2c3d4-0000-0000-0000-000000000001', '2', 'Main Floor', 4, 'qr-table-2-demo-token-bbb'),
  ('b1000000-0000-0000-0000-000000000003', 'a1b2c3d4-0000-0000-0000-000000000001', '3', 'Main Floor', 2, 'qr-table-3-demo-token-ccc'),
  ('b1000000-0000-0000-0000-000000000004', 'a1b2c3d4-0000-0000-0000-000000000001', '4', 'Window Seat', 2, 'qr-table-4-demo-token-ddd'),
  ('b1000000-0000-0000-0000-000000000005', 'a1b2c3d4-0000-0000-0000-000000000001', '5', 'Patio',      6, 'qr-table-5-demo-token-eee'),
  ('b1000000-0000-0000-0000-000000000006', 'a1b2c3d4-0000-0000-0000-000000000001', '6', 'Bar',        3, 'qr-table-6-demo-token-fff');

-- Order number sequence row
insert into order_number_seq (venue_id, last_seq) values ('a1b2c3d4-0000-0000-0000-000000000001', 0);

-- Menu categories
insert into menu_categories (id, venue_id, name, description, sort_order) values
  ('c1000000-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000001', 'Starters',        'Small plates to begin',        1),
  ('c1000000-0000-0000-0000-000000000002', 'a1b2c3d4-0000-0000-0000-000000000001', 'Salads',          'Fresh and seasonal',           2),
  ('c1000000-0000-0000-0000-000000000003', 'a1b2c3d4-0000-0000-0000-000000000001', 'Mains',           'Hearty plates',                3),
  ('c1000000-0000-0000-0000-000000000004', 'a1b2c3d4-0000-0000-0000-000000000001', 'Burgers & Sandwiches', 'Stacked and loaded',       4),
  ('c1000000-0000-0000-0000-000000000005', 'a1b2c3d4-0000-0000-0000-000000000001', 'Sides',           'Complete your meal',           5),
  ('c1000000-0000-0000-0000-000000000006', 'a1b2c3d4-0000-0000-0000-000000000001', 'Desserts',        'Sweet endings',                6),
  ('c1000000-0000-0000-0000-000000000007', 'a1b2c3d4-0000-0000-0000-000000000001', 'Drinks',          'Soft drinks and more',         7);

-- Menu items
insert into menu_items (id, venue_id, category_id, name, description, price, sort_order, available, allergens, prep_time_min) values
  -- Starters
  ('d1000000-0000-0000-0000-000000000001', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Crispy Calamari', 'Lightly battered rings with marinara sauce and lemon aioli', 12.00, 1, true, ARRAY['gluten','shellfish'], 10),
  ('d1000000-0000-0000-0000-000000000002', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Garlic Bread', 'Rustic sourdough with herb butter, served warm', 6.00, 2, true, ARRAY['gluten','dairy'], 5),
  ('d1000000-0000-0000-0000-000000000003', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Burrata & Tomato', 'Fresh burrata, heirloom tomatoes, basil oil, sea salt', 14.00, 3, true, ARRAY['dairy'], 5),
  ('d1000000-0000-0000-0000-000000000004', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001',
   'Loaded Nachos', 'House chips, three-cheese blend, jalapeños, salsa, sour cream', 13.00, 4, true, ARRAY['dairy','gluten'], 12),
  -- Salads
  ('d1000000-0000-0000-0000-000000000005', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002',
   'Classic Caesar', 'Romaine, parmesan, house-made dressing, sourdough croutons', 13.00, 1, true, ARRAY['dairy','gluten','eggs'], 8),
  ('d1000000-0000-0000-0000-000000000006', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000002',
   'Rustic Chop', 'Mixed greens, cucumber, red onion, feta, kalamata, lemon vinaigrette', 14.00, 2, true, ARRAY['dairy'], 8),
  -- Mains
  ('d1000000-0000-0000-0000-000000000007', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003',
   '8oz Ribeye Steak', 'Grilled ribeye, herb butter, choice of side', 38.00, 1, true, ARRAY['dairy'], 20),
  ('d1000000-0000-0000-0000-000000000008', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003',
   'Pan-Seared Salmon', 'Atlantic salmon, lemon caper sauce, seasonal vegetables', 28.00, 2, true, ARRAY['fish','dairy'], 18),
  ('d1000000-0000-0000-0000-000000000009', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003',
   'Mushroom Risotto', 'Arborio rice, wild mushrooms, parmesan, truffle oil (v)', 22.00, 3, true, ARRAY['dairy'], 20),
  ('d1000000-0000-0000-0000-000000000010', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003',
   'Half Roast Chicken', 'Free-range chicken, pan jus, roasted garlic mash, greens', 26.00, 4, true, ARRAY['dairy'], 25),
  -- Burgers
  ('d1000000-0000-0000-0000-000000000011', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004',
   'The Classic Burger', '6oz beef patty, cheddar, lettuce, tomato, pickles, house sauce', 16.00, 1, true, ARRAY['gluten','dairy','eggs'], 15),
  ('d1000000-0000-0000-0000-000000000012', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004',
   'Spicy Crispy Chicken', 'Buttermilk fried thigh, sriracha mayo, slaw, brioche bun', 16.00, 2, true, ARRAY['gluten','dairy','eggs'], 15),
  ('d1000000-0000-0000-0000-000000000013', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000004',
   'Black Bean Burger', 'House-made black bean patty, avocado, chipotle aioli (v)', 15.00, 3, true, ARRAY['gluten','eggs'], 15),
  -- Sides
  ('d1000000-0000-0000-0000-000000000014', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005',
   'Truffle Fries', 'Thin-cut fries, truffle oil, parmesan, parsley', 8.00, 1, true, ARRAY['dairy'], 8),
  ('d1000000-0000-0000-0000-000000000015', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005',
   'Sweet Potato Fries', 'Crispy sweet potato with chipotle dipping sauce', 7.00, 2, true, NULL, 8),
  ('d1000000-0000-0000-0000-000000000016', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005',
   'House Slaw', 'Cabbage, carrot, apple cider vinaigrette', 5.00, 3, true, NULL, 3),
  ('d1000000-0000-0000-0000-000000000017', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000005',
   'Garlic Mash', 'Creamy mashed potato with roasted garlic and chive', 6.00, 4, true, ARRAY['dairy'], 5),
  -- Desserts
  ('d1000000-0000-0000-0000-000000000018', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000006',
   'Warm Chocolate Brownie', 'Dark chocolate brownie, vanilla ice cream, salted caramel', 9.00, 1, true, ARRAY['gluten','dairy','eggs'], 8),
  ('d1000000-0000-0000-0000-000000000019', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000006',
   'New York Cheesecake', 'Classic slice with berry compote', 8.00, 2, true, ARRAY['gluten','dairy','eggs'], 3),
  ('d1000000-0000-0000-0000-000000000020', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000006',
   'Affogato', 'Double espresso over vanilla gelato', 7.00, 3, true, ARRAY['dairy'], 3),
  -- Drinks
  ('d1000000-0000-0000-0000-000000000021', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000007',
   'Soft Drinks', 'Coke, Diet Coke, Sprite, Lemonade', 3.50, 1, true, NULL, 2),
  ('d1000000-0000-0000-0000-000000000022', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000007',
   'Sparkling Water', 'San Pellegrino 500ml', 4.00, 2, true, NULL, 2),
  ('d1000000-0000-0000-0000-000000000023', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000007',
   'Fresh Juice', 'Orange, apple, or watermelon', 5.00, 3, true, NULL, 5),
  ('d1000000-0000-0000-0000-000000000024', 'a1b2c3d4-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000007',
   'Iced Coffee', 'Cold brew over ice with milk', 5.50, 4, true, ARRAY['dairy'], 3);

-- Item options for Steak (doneness)
insert into item_options (id, item_id, group_name, required, multi_select) values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000007', 'Doneness', true, false);

insert into item_option_choices (option_id, label, price_delta) values
  ('e1000000-0000-0000-0000-000000000001', 'Rare', 0),
  ('e1000000-0000-0000-0000-000000000001', 'Medium Rare', 0),
  ('e1000000-0000-0000-0000-000000000001', 'Medium', 0),
  ('e1000000-0000-0000-0000-000000000001', 'Well Done', 0);

-- Item options for Burgers (bun)
insert into item_options (id, item_id, group_name, required, multi_select) values
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000011', 'Bun', false, false);

insert into item_option_choices (option_id, label, price_delta) values
  ('e1000000-0000-0000-0000-000000000002', 'Brioche Bun', 0),
  ('e1000000-0000-0000-0000-000000000002', 'Whole Wheat', 0),
  ('e1000000-0000-0000-0000-000000000002', 'Lettuce Wrap (GF)', 0);

-- Item options for Soft Drinks (flavour)
insert into item_options (id, item_id, group_name, required, multi_select) values
  ('e1000000-0000-0000-0000-000000000003', 'd1000000-0000-0000-0000-000000000021', 'Flavour', true, false);

insert into item_option_choices (option_id, label, price_delta) values
  ('e1000000-0000-0000-0000-000000000003', 'Coke', 0),
  ('e1000000-0000-0000-0000-000000000003', 'Diet Coke', 0),
  ('e1000000-0000-0000-0000-000000000003', 'Sprite', 0),
  ('e1000000-0000-0000-0000-000000000003', 'Lemonade', 0);
