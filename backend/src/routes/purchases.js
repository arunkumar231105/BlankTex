import { Router } from 'express';
import { pool, query } from '../db.js';
import { cloudinaryUpload, supplierConfig, supplierPost, SUPPLIER_STATUSES } from '../supplier.js';
import { syncRiinCatalog } from '../supplierCatalog.js';
import { wrap } from './crud.js';

const router = Router();
const imageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp']);

function httpError(message, status = 400) { return Object.assign(new Error(message), { status }); }
function requiredText(value, label, max = 250) {
  const result = String(value ?? '').trim();
  if (!result) throw httpError(`${label} is required`);
  if (result.length > max) throw httpError(`${label} is too long`);
  return result;
}
function optionalText(value, max = 250) {
  const result = String(value ?? '').trim();
  if (result.length > max) throw httpError('A field is too long');
  return result || null;
}

async function fulfillmentSupplier(supplierId) {
  const id = requiredText(supplierId, 'Supplier', 50);
  const { rows } = await query(`SELECT supplier_id,supplier_code,supplier_name,api_provider,api_available
    FROM suppliers WHERE supplier_id=$1 AND default_status='Active'`, [id]);
  if (!rows[0]) throw httpError('Selected supplier is not active');
  if (!rows[0].api_available || String(rows[0].api_provider).toUpperCase() !== 'RIIN') {
    throw httpError(`${rows[0].supplier_name} is not configured for purchase-order API submission`);
  }
  return rows[0];
}

async function catalogItem(client, item, index, supplierId) {
  const quantity = Number.parseInt(item.quantity, 10);
  const craftType = Number.parseInt(item.craft_type, 10);
  if (!Number.isInteger(quantity) || quantity < 1) throw httpError(`Item #${index + 1}: quantity must be at least 1`);
  if (![1, 2].includes(craftType)) throw httpError(`Item #${index + 1}: craft type is invalid`);
  const { rows } = await client.query(
    `SELECT s.supplier_style_id AS style_id, s.style_code AS style_no, s.display_name AS style_name,
            s.craft_types, c.supplier_color_id AS style_color_id, c.color_code,
            c.display_name AS color_name, z.supplier_size_id AS style_size_id,
            z.size_code, z.display_name AS size_name
       FROM supplier_catalog_styles s
       JOIN supplier_catalog_colors c ON c.supplier_id = s.supplier_id
       JOIN supplier_catalog_sizes z ON z.supplier_id = s.supplier_id
      WHERE s.supplier_style_id = $1 AND c.supplier_color_id = $2 AND z.supplier_size_id = $3
        AND s.supplier_id = $4 AND c.supplier_id = $4 AND z.supplier_id = $4
        AND s.active = TRUE AND s.enabled = TRUE AND c.active = TRUE AND z.active = TRUE`,
    [item.style_id, item.style_color_id, item.style_size_id, supplierId],
  );
  if (!rows[0]) throw httpError(`Item #${index + 1}: style, color, and size do not match`);
  const supportedCrafts = String(rows[0].craft_types || '').split(',').map(Number).filter(Number.isInteger);
  if (supportedCrafts.length && !supportedCrafts.includes(craftType)) throw httpError(`Item #${index + 1}: selected style does not support that craft type`);
  const position = optionalText(item.print_position, 10);
  if (position && !['1', '2', '1,2'].includes(position)) throw httpError(`Item #${index + 1}: print position is invalid`);
  const images = item.images || {};
  if (!images.front_print?.url || !images.front_mockup?.url) throw httpError(`Item #${index + 1}: print and mockup images are required`);
  if (position === '1,2' && (!images.back_print?.url || !images.back_mockup?.url)) throw httpError(`Item #${index + 1}: back images are required for Both position`);
  return { ...item, ...rows[0], quantity, craftType, position, images };
}

function supplierPayload(body, orderNo, orderTime, carrier, items) {
  const goodsList = items.map((item, index) => {
    const imageList = [
      { type: 1, imageUrl: item.images.front_print.url, imageCode: item.images.front_print.public_id || `print_${orderNo}_${index + 1}`, imageName: item.images.front_print.public_id || `print_${orderNo}_${index + 1}` },
      { type: 2, imageUrl: item.images.front_mockup.url, imageCode: item.images.front_mockup.public_id || `mockup_${orderNo}_${index + 1}`, imageName: item.images.front_mockup.public_id || `mockup_${orderNo}_${index + 1}` },
    ];
    if (item.position === '1,2') {
      imageList.push({ type: 1, imageUrl: item.images.back_print.url, imageCode: item.images.back_print.public_id || `printback_${orderNo}_${index + 1}`, imageName: item.images.back_print.public_id || `printback_${orderNo}_${index + 1}` });
      imageList.push({ type: 2, imageUrl: item.images.back_mockup.url, imageCode: item.images.back_mockup.public_id || `mockupback_${orderNo}_${index + 1}`, imageName: item.images.back_mockup.public_id || `mockupback_${orderNo}_${index + 1}` });
    }
    const goods = {
      platformOid: orderNo, platformOllId: `${orderNo}${String(index + 1).padStart(3, '0')}`,
      goodsType: 1, title: requiredText(item.product_title, `Item #${index + 1} title`),
      goodsStatus: 'NOT_SHIPPED', refundStatus: 'NO_REFUND',
      sizeCode: item.size_code, sizeName: item.size_name || item.size_code,
      colorCode: item.color_code, colorName: item.color_name || item.color_code,
      styleCode: item.style_no, styleName: item.style_name || item.style_no,
      craftType: item.craftType, num: item.quantity, imageList,
    };
    if (item.position) goods.printPosition = item.position;
    if (item.specification) goods.specification = item.specification;
    if (item.remark) goods.remark = item.remark;
    return goods;
  });
  const payload = {
    platformType: 15, sourcePlatformOid: orderNo, platformOrderStatus: 'NOT_SHIPPED',
    platformRefundStatus: 'NO_REFUND', platformOid: orderNo,
    consigneeName: requiredText(body.recipient_name, 'Full Name', 160),
    phone: requiredText(body.phone, 'Phone', 60), address: requiredText(body.address_line_1, 'Address Line 1'),
    addressOptional: optionalText(body.address_line_2) || '', receiverCountry: requiredText(body.country, 'Country', 100),
    receiverProvince: requiredText(body.state_province, 'State / Province', 120),
    receiverCity: requiredText(body.city, 'City', 120), postCode: requiredText(body.postal_code, 'ZIP Code', 30),
    orderTime: orderTime.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ''), goodsList,
  };
  if (carrier) payload.deliveryCourier = carrier;
  return payload;
}

router.get('/catalog', wrap(async (_req, res) => {
  const [suppliers, styles, colors, sizes] = await Promise.all([
    query(`SELECT supplier_id,supplier_code,supplier_name,api_available,api_provider,website,
                  (api_available=TRUE AND UPPER(COALESCE(api_provider,''))='RIIN') can_place_order
             FROM suppliers WHERE default_status='Active' ORDER BY supplier_name`),
    query(`SELECT supplier_style_id style_id,supplier_id,style_code style_no,display_name style_name,
                  style_name raw_name,craft_types,images,price_mode,last_synced_at
             FROM supplier_catalog_styles WHERE active=TRUE AND enabled=TRUE ORDER BY supplier_id,display_name,style_code`),
    query(`SELECT supplier_color_id style_color_id,supplier_id,color_code,display_name color_name,
                  display_name,color_name raw_name,last_synced_at
             FROM supplier_catalog_colors WHERE active=TRUE ORDER BY supplier_id,display_name,color_code`),
    query(`SELECT supplier_size_id style_size_id,supplier_id,size_code,display_name size_name,
                  size_name raw_name,last_synced_at
             FROM supplier_catalog_sizes WHERE active=TRUE ORDER BY supplier_id,display_name,size_code`),
  ]);
  res.json({ suppliers: suppliers.rows, styles: styles.rows, colors: colors.rows, sizes: sizes.rows });
}));

router.post('/catalog/sync', wrap(async (req, res) => {
  const supplier = await fulfillmentSupplier(req.body?.supplier_id);
  const counts = await syncRiinCatalog(supplier.supplier_id);
  res.json({ success: true, supplier_id: supplier.supplier_id, ...counts });
}));

router.get('/integration', wrap(async (_req, res) => {
  const config = supplierConfig();
  res.json({ configured: Boolean(config.secretKey), cloudinary_configured: Boolean(config.cloudName && config.cloudinaryKey && config.cloudinarySecret), base_url: config.baseUrl, env: config.env });
}));

router.post('/integration/test', wrap(async (_req, res) => {
  const result = await supplierPost('/trade/api/interface/queryColor', { pageIndex: 1, pageSize: 1 });
  res.json({ success: true, connected: true, records: result.data?.records?.length || 0 });
}));

router.post('/upload', wrap(async (req, res) => {
  const mimeType = String(req.body?.mime_type || '');
  if (!imageMimeTypes.has(mimeType)) throw httpError('Choose a PNG, JPG, or WebP image');
  const match = String(req.body?.data || '').match(/^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw httpError('Image data is invalid');
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw httpError('Image must be 10 MB or smaller');
  const signatures = {
    'image/png': buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),
    'image/jpeg': buffer[0]===0xff && buffer[1]===0xd8 && buffer[buffer.length-2]===0xff && buffer[buffer.length-1]===0xd9,
    'image/webp': buffer.subarray(0,4).toString()==='RIFF' && buffer.subarray(8,12).toString()==='WEBP',
  };
  if (!signatures[mimeType]) throw httpError('File contents do not match the image type');
  res.status(201).json(await cloudinaryUpload(buffer, mimeType, optionalText(req.body?.original_name, 255)));
}));

router.get('/', wrap(async (req, res) => {
  const params = [];
  const where = [];
  if (req.query.q) { params.push(`%${req.query.q}%`); where.push(`(p.order_no ILIKE $${params.length} OR p.recipient_name ILIKE $${params.length} OR p.city ILIKE $${params.length} OR p.phone ILIKE $${params.length})`); }
  if (req.query.status) { params.push(Number(req.query.status)); where.push(`p.supplier_status=$${params.length}`); }
  const { rows } = await query(`
    SELECT p.*,sup.supplier_name,sup.supplier_code,
           GREATEST(p.goods_count,COUNT(pi.purchase_item_id)::int) item_count,
           COALESCE(SUM(pi.quantity),0)::int total_quantity
      FROM purchases p
      LEFT JOIN suppliers sup ON sup.supplier_id=p.supplier_id
      LEFT JOIN purchase_items pi ON pi.purchase_id=p.purchase_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY p.purchase_id,sup.supplier_name,sup.supplier_code ORDER BY p.created_at DESC`, params);
  res.json(rows);
}));

router.post('/sync', wrap(async (req, res) => {
  let orderNos = Array.isArray(req.body?.order_nos) ? req.body.order_nos : [];
  if (!orderNos.length) orderNos = (await query("SELECT order_no FROM purchases WHERE submission_status='Submitted' ORDER BY created_at DESC")).rows.map((row) => row.order_no);
  let updated = 0;
  for (let index = 0; index < orderNos.length; index += 100) {
    const batch = orderNos.slice(index, index + 100);
    const result = await supplierPost('/trade/api/interface/queryOrderStatus', { platformOidList: batch });
    for (const item of result.data || []) {
      await query(`UPDATE purchases SET supplier_status=$1,supplier_status_str=$2,synced_at=NOW(),last_sync_error=NULL WHERE order_no=$3`,
        [item.orderStatus, item.orderStateStr || SUPPLIER_STATUSES[item.orderStatus] || '', item.platformOid]);
      updated += 1;
    }
  }
  res.json({ success: true, updated });
}));

router.post('/import', wrap(async (req, res) => {
  const orderNo = requiredText(req.body?.order_no, 'Supplier Order ID', 80);
  const supplier = await fulfillmentSupplier(req.body?.supplier_id || (await query("SELECT supplier_id FROM suppliers WHERE supplier_code='RIIN'")).rows[0]?.supplier_id);
  const result = await supplierPost('/trade/api/interface/queryOrderInfo', { platformOidList: [orderNo] });
  const order = result.data?.[0];
  if (!order) throw httpError('Order not found on supplier portal', 404);
  const { rows } = await query(`
    INSERT INTO purchases (order_no,carrier,order_time,recipient_name,phone,address_line_1,address_line_2,city,state_province,postal_code,country,status,created_by,supplier_status,supplier_status_str,goods_count,supplier_payload,synced_at,supplier_id,submission_status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Placed',$12,$13,$14,$15,$16,NOW(),$17,'Submitted')
    ON CONFLICT (order_no) DO UPDATE SET carrier=EXCLUDED.carrier,recipient_name=EXCLUDED.recipient_name,phone=EXCLUDED.phone,address_line_1=EXCLUDED.address_line_1,address_line_2=EXCLUDED.address_line_2,city=EXCLUDED.city,state_province=EXCLUDED.state_province,postal_code=EXCLUDED.postal_code,country=EXCLUDED.country,supplier_status=EXCLUDED.supplier_status,supplier_status_str=EXCLUDED.supplier_status_str,goods_count=EXCLUDED.goods_count,supplier_payload=EXCLUDED.supplier_payload,supplier_id=EXCLUDED.supplier_id,submission_status='Submitted',synced_at=NOW()
    RETURNING purchase_id,order_no`,
    [order.platformOid, order.deliveryCourier || null, order.orderTime || new Date(), order.consigneeName || 'Unknown', order.phone || '', order.address || '', order.addressOptional || null, order.receiverCity || '', order.receiverProvince || '', order.postCode || '', order.receiverCountry || 'US', req.user?.user_id || null, order.orderStatus || 2, order.orderStateStr || SUPPLIER_STATUSES[order.orderStatus] || 'Pending Push', order.goodsList?.length || order.goodsTotalQty || 0, order, supplier.supplier_id]);
  res.json({ success: true, ...rows[0] });
}));

router.post('/', wrap(async (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw httpError('Add at least one item');
  const supplier = await fulfillmentSupplier(body.supplier_id);
  const orderNo = requiredText(body.order_no, 'Order ID', 80);
  const orderTime = new Date(body.order_time);
  if (Number.isNaN(orderTime.getTime())) throw httpError('Order Time is invalid');
  const carrier = optionalText(body.carrier, 30);
  if (carrier && !['USPS','UPS','FedEx'].includes(carrier)) throw httpError('Carrier is invalid');
  if ((await query('SELECT 1 FROM purchases WHERE order_no=$1', [orderNo])).rowCount) throw httpError(`Order ID ${orderNo} already exists`, 409);

  const validationClient = await pool.connect();
  let enriched;
  try { enriched = await Promise.all(items.map((item,index) => catalogItem(validationClient,item,index,supplier.supplier_id))); }
  finally { validationClient.release(); }
  const payload = supplierPayload(body, orderNo, orderTime, carrier, enriched);

  const client = await pool.connect();
  let purchaseId;
  try {
    await client.query('BEGIN');
    const purchase = await client.query(`INSERT INTO purchases
      (order_no,carrier,order_time,recipient_name,phone,address_line_1,address_line_2,city,state_province,postal_code,country,created_by,supplier_status,supplier_status_str,goods_count,supplier_payload,supplier_id,status,submission_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,2,'Pending Push',$13,$14,$15,'Draft','Submitting') RETURNING *`,
      [orderNo,carrier,orderTime,payload.consigneeName,payload.phone,payload.address,payload.addressOptional||null,payload.receiverCity,payload.receiverProvince,payload.postCode,payload.receiverCountry,req.user?.user_id||null,enriched.length,payload,supplier.supplier_id]);
    purchaseId = purchase.rows[0].purchase_id;
    for (let index=0; index<enriched.length; index+=1) {
      const item=enriched[index];
      const skuCode = `${item.style_no}-${item.color_code}-${item.size_code}`;
      const inserted=await client.query(`INSERT INTO purchase_items
        (purchase_id,line_no,product_title,supplier_style_id,supplier_color_id,supplier_size_id,supplier_sku_code,craft_type,quantity,print_position,specification,remark)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING purchase_item_id`,
        [purchase.rows[0].purchase_id,index+1,item.product_title,item.style_id,item.style_color_id,item.style_size_id,skuCode,item.craftType,item.quantity,item.position,optionalText(item.specification,200),optionalText(item.remark,2000)]);
      for (const role of ['front_print','front_mockup','back_print','back_mockup']) if (item.images[role]?.url) await client.query(`INSERT INTO purchase_item_images (purchase_item_id,image_role,image_url,original_name) VALUES ($1,$2,$3,$4)`,[inserted.rows[0].purchase_item_id,role,item.images[role].url,optionalText(item.images[role].original_name,255)]);
    }
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }

  try {
    await supplierPost('/trade/api/interface/placeOrder', payload);
    await query(`UPDATE purchases SET status='Placed',submission_status='Submitted',last_sync_error=NULL,synced_at=NOW() WHERE purchase_id=$1`, [purchaseId]);
    return res.status(201).json({ success:true,purchase_id:purchaseId,order_no:orderNo,submission_status:'Submitted' });
  } catch (error) {
    await query(`UPDATE purchases SET submission_status='Failed',last_sync_error=$1 WHERE purchase_id=$2`, [error.message,purchaseId]);
    return res.status(202).json({ success:false,order_saved:true,purchase_id:purchaseId,order_no:orderNo,submission_status:'Failed',message:error.message });
  }
}));

router.post('/:orderNo/retry', wrap(async (req,res) => {
  const order=(await query(`SELECT p.*,sup.api_provider,sup.api_available FROM purchases p LEFT JOIN suppliers sup ON sup.supplier_id=p.supplier_id WHERE p.order_no=$1`,[req.params.orderNo])).rows[0];
  if(!order) throw httpError('Order not found',404);
  if(order.submission_status==='Submitted') throw httpError('Order has already been submitted');
  if(!order.supplier_payload?.platformOid) throw httpError('Saved supplier payload is missing');
  await fulfillmentSupplier(order.supplier_id);
  await query(`UPDATE purchases SET submission_status='Submitting',last_sync_error=NULL WHERE purchase_id=$1`,[order.purchase_id]);
  try {
    await supplierPost('/trade/api/interface/placeOrder',order.supplier_payload);
    await query(`UPDATE purchases SET status='Placed',submission_status='Submitted',last_sync_error=NULL,synced_at=NOW() WHERE purchase_id=$1`,[order.purchase_id]);
    res.json({success:true,order_no:order.order_no});
  } catch(error) {
    await query(`UPDATE purchases SET submission_status='Failed',last_sync_error=$1 WHERE purchase_id=$2`,[error.message,order.purchase_id]);
    throw error;
  }
}));

router.get('/:orderNo', wrap(async (req, res) => {
  const purchase=(await query('SELECT p.*,sup.supplier_name,sup.supplier_code FROM purchases p LEFT JOIN suppliers sup ON sup.supplier_id=p.supplier_id WHERE p.order_no=$1',[req.params.orderNo])).rows[0];
  if (!purchase) throw httpError('Order not found',404);
  const items=(await query(`SELECT pi.*,
      COALESCE(ss.style_code,s.style_no) style_no,COALESCE(ss.display_name,s.style_name) style_name,
      COALESCE(sc.display_name,c.color_name) color_name,COALESCE(sc.color_code,c.supplier_color_code,c.internal_color_code) color_code,
      COALESCE(sz.size_code,z.size_code) size_code,COALESCE(sz.display_name,z.size_name) size_name
    FROM purchase_items pi
    LEFT JOIN supplier_catalog_styles ss ON ss.supplier_style_id=pi.supplier_style_id
    LEFT JOIN supplier_catalog_colors sc ON sc.supplier_color_id=pi.supplier_color_id
    LEFT JOIN supplier_catalog_sizes sz ON sz.supplier_size_id=pi.supplier_size_id
    LEFT JOIN styles s ON s.style_id=pi.style_id
    LEFT JOIN style_colors c ON c.style_color_id=pi.style_color_id
    LEFT JOIN style_sizes z ON z.style_size_id=pi.style_size_id
    WHERE pi.purchase_id=$1 ORDER BY pi.line_no`,[purchase.purchase_id])).rows;
  const images=(await query(`SELECT pii.* FROM purchase_item_images pii JOIN purchase_items pi ON pi.purchase_item_id=pii.purchase_item_id WHERE pi.purchase_id=$1`,[purchase.purchase_id])).rows;
  for (const item of items) item.images=images.filter((image)=>image.purchase_item_id===item.purchase_item_id);
  res.json({ ...purchase,items });
}));

router.put('/:orderNo/notes', wrap(async (req,res) => { const result=await query('UPDATE purchases SET notes=$1 WHERE order_no=$2 RETURNING order_no',[optionalText(req.body?.notes,5000)||'',req.params.orderNo]); if(!result.rowCount) throw httpError('Order not found',404); res.json({success:true}); }));

router.post('/:orderNo/close', wrap(async (req,res) => { await supplierPost('/trade/api/interface/closeOrder',{platformOid:req.params.orderNo}); await query(`UPDATE purchases SET supplier_status=13,supplier_status_str='Closed',synced_at=NOW() WHERE order_no=$1`,[req.params.orderNo]); res.json({success:true}); }));

router.get('/:orderNo/delivery', wrap(async (req,res) => res.json(await supplierPost('/trade/api/interface/queryOrderDelivery',{platformOidList:[req.params.orderNo]}))));

router.put('/:orderNo/shipping', wrap(async (req,res) => {
  const order=(await query('SELECT * FROM purchases WHERE order_no=$1',[req.params.orderNo])).rows[0];
  if(!order) throw httpError('Order not found',404);
  const body=req.body||{};
  const payload={sourcePlatformOid:order.order_no,platformOid:order.order_no,platformOrderStatus:'NOT_SHIPPED',consigneeName:requiredText(body.recipient_name,'Full Name',160),phone:requiredText(body.phone,'Phone',60),address:requiredText(body.address_line_1,'Address Line 1'),receiverCity:requiredText(body.city,'City',120),receiverProvince:requiredText(body.state_province,'State / Province',120),receiverCountry:requiredText(body.country,'Country',100),postCode:requiredText(body.postal_code,'ZIP Code',30),deliveryCourier:optionalText(body.carrier,30)||'',goodsUpdateList:[]};
  await supplierPost('/trade/api/interface/updateOrder',payload);
  await query(`UPDATE purchases SET recipient_name=$1,phone=$2,address_line_1=$3,city=$4,state_province=$5,country=$6,postal_code=$7,carrier=$8,synced_at=NOW() WHERE order_no=$9`,[payload.consigneeName,payload.phone,payload.address,payload.receiverCity,payload.receiverProvince,payload.receiverCountry,payload.postCode,payload.deliveryCourier||null,order.order_no]);
  res.json({success:true});
}));

export default router;
