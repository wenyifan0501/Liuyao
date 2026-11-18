ALTER TABLE consultations ADD COLUMN method text NOT NULL DEFAULT 'liuyao' CHECK(method IN ('liuyao','meihua','qiuqian','jiaobei'));
ALTER TABLE consultations ADD COLUMN oracle jsonb;
