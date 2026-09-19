// Initial demonstration data belongs to the server. The browser reads it through the API.
export function seedCatalog(db) {
  const roots = [
    ['Конструктори', 'constructors', 'lego.svg'],
    ['Ляльки', 'dolls', 'doll.svg'],
    ['М’які іграшки', 'plush', 'teddy.svg'],
    ['Машинки, роботи та техніка', 'vehicles', 'robot 1.svg'],
    ['Творчість', 'creative', 'paint-board-and-brush 1.svg'],
    ['Ігрові фігурки', 'figures', 'Funko_Pup 1.svg'],
    ['Іграшкова зброя', 'toy-blasters', 'gun 1.svg'],
    ['Шкільні товари', 'school', 'school-book-bag 1.svg'],
    ['Настільні ігри', 'board-games', 'dice 1.svg'],
    ['Музичні інструменти', 'music', 'party 1.svg'],
    ['Автокрісла та візочки', 'baby', 'baby-stroller 1.svg'],
    ['Гаджети для геймінгу', 'gaming', 'gamepad 1.svg'],
    ['Книги', 'books', 'open-book 1.svg'],
    ['Подарункові сертифікати', 'gifts', 'Gift--Streamline-Heroicons-Outline 1.svg'],
  ];
  const category = db.prepare(
    'INSERT INTO categories (id,name,slug,parent_id,icon) VALUES (?,?,?,?,?)',
  );
  roots.forEach(([name, slug, icon], i) =>
    category.run(i + 1, name, slug, null, `/img/category/${icon}`),
  );
  category.run(15, 'LEGO Speed Champions', 'lego-speed', 1, '/img/category/lego.svg');
  category.run(16, 'Набори для малюків', 'toddler-blocks', 1, '/img/category/lego.svg');
  category.run(17, 'Сімейні ігри', 'family-games', 9, '/img/category/dice 1.svg');
  const rows = [
    [
      'Конструктор LEGO® Speed Champions Mercedes-AMG ONE',
      15,
      'LEGO',
      9,
      1150,
      1450,
      12,
      '75909_mercedes-amgone.jpg',
    ],
    [
      'Конструктор LEGO® Speed Champions Mercedes-AMG F1',
      15,
      'LEGO',
      9,
      1299,
      1499,
      8,
      '77244_amg_f1.jpg',
    ],
    [
      'Конструктор LEGO® Speed Champions Ferrari',
      15,
      'LEGO',
      9,
      1450,
      2300,
      6,
      '77254_ferrari.jpg',
    ],
    [
      'Фігурка LEGO® Кріштіану Роналду',
      6,
      'LEGO',
      10,
      850,
      1564,
      0,
      'lego43016cristianoronaldo.webp',
    ],
    ['LEGO® Кубок Чемпіонів', 1, 'LEGO', 7, 499, 650, 15, 'lego_cup_000002.jpg'],
    ['Конструктор «Перші відкриття», 42 деталі', 16, 'Світ Іграшок', 2, 649, null, 18],
    ['Лялька Софія з гардеробом', 2, 'Світ Іграшок', 3, 799, 999, 10],
    ['Лялька-мандрівниця з рюкзаком', 2, 'Світ Іграшок', 3, 599, null, 14],
    ['М’який ведмедик Обіймашка, 35 см', 3, 'Світ Іграшок', 0, 459, 549, 20],
    ['М’який зайчик Соня, 25 см', 3, 'Світ Іграшок', 0, 329, null, 23],
    ['Машинка «Міський гонщик»', 4, 'Світ Іграшок', 3, 189, null, 30],
    ['Робот-дослідник на радіокеруванні', 4, 'Світ Іграшок', 6, 1199, 1399, 7],
    ['Набір для малювання, 48 кольорів', 5, 'Світ Іграшок', 4, 379, 449, 16],
    ['Майстерня ліплення «Кольоровий світ»', 5, 'Світ Іграшок', 3, 249, null, 25],
    ['Фігурка космічного мандрівника', 6, 'Світ Іграшок', 6, 349, null, 10],
    ['Бластер з м’якими стрілами', 7, 'Світ Іграшок', 8, 549, 699, 9],
    ['Шкільний рюкзак «Космос»', 8, 'Світ Іграшок', 6, 899, null, 11],
    ['Пенал «Веселка» з наповненням', 8, 'Світ Іграшок', 6, 299, 349, 18],
    ['Настільна гра «Велика подорож»', 17, 'Світ Іграшок', 6, 499, 599, 13],
    ['Настільна гра «Знайди пару»', 17, 'Світ Іграшок', 3, 219, null, 21],
    ['Дитячий ксилофон «Мелодія»', 10, 'Світ Іграшок', 3, 399, null, 12],
    ['Дитяча гітара «Перший концерт»', 10, 'Світ Іграшок', 4, 699, 849, 5],
    ['Прогулянковий візочок «Легкість»', 11, 'Світ Іграшок', 0, 3299, 3799, 3],
    ['Ігровий контролер «Піксель»', 12, 'Світ Іграшок', 6, 799, null, 8],
    ['Книга «Казки перед сном»', 13, 'Світ Іграшок', 3, 279, null, 24],
    ['Енциклопедія «Дивовижні динозаври»', 13, 'Світ Іграшок', 6, 429, 499, 15],
    ['Подарунковий сертифікат 500 ₴', 14, 'Світ Іграшок', 0, 500, null, 50],
    ['Подарунковий сертифікат 1000 ₴', 14, 'Світ Іграшок', 0, 1000, null, 50],
  ];
  const insert = db.prepare(
    'INSERT INTO products (title,description,category_id,brand,age_min,price,old_price,stock,image) VALUES (?,?,?,?,?,?,?,?,?)',
  );
  rows.forEach(([title, cat, brand, age, price, old, stock, image]) => {
    const rootId = cat === 15 || cat === 16 ? 1 : cat === 17 ? 9 : cat;
    const img = image ? `/img/products/${image}` : `/img/category/${roots[rootId - 1][2]}`;
    insert.run(
      title,
      `${title}. Демонстраційний товар навчального магазину «Світ Іграшок». Вік: ${age}+. Комплектація та характеристики наведені для демонстрації каталогу.`,
      cat,
      brand,
      age,
      price * 100,
      old ? old * 100 : null,
      stock,
      img,
    );
  });
}
