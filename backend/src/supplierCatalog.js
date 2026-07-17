import { pool } from './db.js';
import { supplierPost } from './supplier.js';

const ZH_EN = {
  '休闲短裤':'Casual Shorts','水洗纯棉棒球帽':'Washed Cotton Baseball Cap','带帽无袖裙子':'Hooded Sleeveless Dress',
  '斜肩女T':'Off-Shoulder Women\'s Tee','高弹力露脐女T':'Crop Top Stretch Women\'s Tee','女款连帽夹克':'Women\'s Hooded Jacket',
  '女款立领夹克':'Women\'s Stand Collar Jacket','男款大码连帽夹克':'Men\'s Plus Size Hooded Jacket',
  '男款大码立领夹克':'Men\'s Plus Size Stand Collar Jacket','男款连帽夹克':'Men\'s Hooded Jacket',
  '男款立领夹克':'Men\'s Stand Collar Jacket','棒球帽':'Baseball Cap','长款爬服':'Long Romper','吉尔丹':'Gildan',
  '圆领短袖T恤':'Crew Neck Short Sleeve T-Shirt','圆领':'Crew Neck','短袖T恤':'Short Sleeve T-Shirt',
  '长袖T恤':'Long Sleeve T-Shirt','连帽卫衣':'Hooded Sweatshirt','圆领卫衣':'Crew Neck Sweatshirt',
  '拉链卫衣':'Zip Hoodie','背心':'Tank Top','短裤':'Shorts','长裤':'Long Pants','卫裤':'Sweatpants',
  '帽子':'Hat','围裙':'Apron','抱枕':'Pillow','帆布袋':'Canvas Bag','手机壳':'Phone Case','马克杯':'Mug',
  '鼠标垫':'Mouse Pad','婴儿连体衣':'Baby Onesie','儿童T恤':'Kids T-Shirt','女款T恤':'Women\'s T-Shirt',
  '男款T恤':'Men\'s T-Shirt','宽松T恤':'Oversized T-Shirt','修身T恤':'Slim Fit T-Shirt','V领T恤':'V-Neck T-Shirt',
  'POLO衫':'Polo Shirt','polo衫':'Polo Shirt','纯棉':'Cotton','涤棉':'Poly-Cotton','男士':'Men\'s','女士':'Women\'s',
  '重磅':'Heavyweight','中性':'Unisex','有绳':'Drawstring','德国':'Germany','巴西':'Brazil','高弹力':'High Stretch',
  '白色':'White','黑色':'Black','红色':'Red','蓝色':'Blue','绿色':'Green','黄色':'Yellow','灰色':'Gray','粉色':'Pink',
  '紫色':'Purple','橙色':'Orange','棕色':'Brown','米色':'Beige','藏青色':'Navy','藏青':'Navy','深蓝色':'Dark Blue',
  '深蓝':'Dark Blue','浅蓝色':'Light Blue','浅蓝':'Light Blue','深灰色':'Dark Gray','深灰':'Dark Gray','浅灰色':'Light Gray',
  '浅灰':'Light Gray','酒红色':'Burgundy','酒红':'Burgundy','军绿色':'Army Green','军绿':'Army Green','卡其色':'Khaki',
  '卡其':'Khaki','天蓝色':'Sky Blue','天蓝':'Sky Blue','宝蓝色':'Royal Blue','宝蓝':'Royal Blue','墨绿色':'Dark Green',
  '墨绿':'Dark Green','花灰':'Heather Gray','杏色':'Apricot','驼色':'Camel','咖啡色':'Coffee','咖啡':'Coffee',
  '玫红色':'Hot Pink','玫红':'Hot Pink','荧光绿':'Neon Green','荧光黄':'Neon Yellow','荧光粉':'Neon Pink',
  '荧光橙':'Neon Orange','深紫':'Dark Purple','浅紫':'Light Purple','浅粉':'Light Pink','深红':'Dark Red',
  '桃红':'Peach','湖蓝':'Lake Blue','米白':'Off-White','本白':'Natural White','漂白':'Bleached White',
  '麻灰':'Linen Gray','铁灰':'Iron Gray','炭灰':'Charcoal','烟灰':'Smoke Gray','银灰':'Silver Gray',
  '翠绿':'Emerald','草绿':'Grass Green','果绿':'Apple Green','橄榄绿':'Olive Green','森林绿':'Forest Green',
  '砖红':'Brick Red','枣红':'Maroon','暗红':'Dark Red','粉红':'Pink','桔色':'Orange','金色':'Gold','银色':'Silver',
  '均码':'One Size','加大':'Plus Size','大码':'Large','小码':'Small',
};

export function translateSupplierText(value) {
  if (!value || !/[\u4e00-\u9fff]/.test(value)) return value || '';
  let translated = value;
  for (const key of Object.keys(ZH_EN).sort((a,b) => b.length-a.length)) translated = translated.split(key).join(ZH_EN[key]);
  return translated;
}

function images(value) {
  try {
    const parsed = Array.isArray(value) ? value : JSON.parse(value || '[]');
    return parsed.filter((url) => typeof url === 'string' && /^https:\/\//i.test(url));
  } catch { return []; }
}

export async function syncRiinCatalog(supplierId) {
  const [styleResult,colorResult,sizeResult] = await Promise.all([
    supplierPost('/trade/api/interface/queryStyle',{pageIndex:1,pageSize:1000}),
    supplierPost('/trade/api/interface/queryColor',{pageIndex:1,pageSize:1000}),
    supplierPost('/trade/api/interface/querySize',{pageIndex:1,pageSize:1000}),
  ]);
  const styles=(styleResult.data?.records||[]).filter((row) => row.styleCode && row.styleName);
  const colors=(colorResult.data?.records||[]).filter((row) => row.colorCode && row.colorName);
  const sizes=(sizeResult.data?.records||[]).filter((row) => row.sizeCode && row.sizeName);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE supplier_catalog_styles SET active=FALSE WHERE supplier_id=$1',[supplierId]);
    await client.query('UPDATE supplier_catalog_colors SET active=FALSE WHERE supplier_id=$1',[supplierId]);
    await client.query('UPDATE supplier_catalog_sizes SET active=FALSE WHERE supplier_id=$1',[supplierId]);
    for (const row of styles) await client.query(`INSERT INTO supplier_catalog_styles (supplier_id,style_code,style_name,display_name,craft_types,images,price_mode,raw_data,active,last_synced_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE,NOW()) ON CONFLICT (supplier_id,style_code) DO UPDATE SET style_name=EXCLUDED.style_name,display_name=EXCLUDED.display_name,craft_types=EXCLUDED.craft_types,images=EXCLUDED.images,price_mode=EXCLUDED.price_mode,raw_data=EXCLUDED.raw_data,active=TRUE,last_synced_at=NOW()`,[supplierId,row.styleCode,row.styleName,translateSupplierText(row.styleName),String(row.craftType||''),JSON.stringify(images(row.images)),row.priceMode??null,row]);
    for (const row of colors) await client.query(`INSERT INTO supplier_catalog_colors (supplier_id,color_code,color_name,display_name,raw_data,active,last_synced_at) VALUES ($1,$2,$3,$4,$5,TRUE,NOW()) ON CONFLICT (supplier_id,color_code) DO UPDATE SET color_name=EXCLUDED.color_name,display_name=EXCLUDED.display_name,raw_data=EXCLUDED.raw_data,active=TRUE,last_synced_at=NOW()`,[supplierId,row.colorCode,row.colorName,translateSupplierText(row.colorName),row]);
    for (const row of sizes) await client.query(`INSERT INTO supplier_catalog_sizes (supplier_id,size_code,size_name,display_name,raw_data,active,last_synced_at) VALUES ($1,$2,$3,$4,$5,TRUE,NOW()) ON CONFLICT (supplier_id,size_code) DO UPDATE SET size_name=EXCLUDED.size_name,display_name=EXCLUDED.display_name,raw_data=EXCLUDED.raw_data,active=TRUE,last_synced_at=NOW()`,[supplierId,row.sizeCode,row.sizeName,translateSupplierText(row.sizeName),row]);
    await client.query('COMMIT');
    return {styles:styles.length,colors:colors.length,sizes:sizes.length};
  } catch(error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}
