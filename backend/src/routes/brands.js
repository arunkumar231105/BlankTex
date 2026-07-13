import { crudRouter } from './crud.js';

export default crudRouter({
  table: 'brands',
  id: 'brand_id',
  orderBy: 'brand_name ASC',
  columns: [
    'brand_code', 'brand_name', 'brand_owner', 'brand_logo', 'website',
    'country_of_origin', 'default_size_system', 'default_currency', 'status', 'remarks',
  ],
});
