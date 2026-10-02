// 도로명·번지는 제외하고 장소의 행정 지역과 이름으로 검색합니다.
export function buildRestaurantSearchQuery(restaurant) {
  const [province = '', city = '', district = ''] = String(restaurant.address || '').trim().split(/\s+/);
  const shortArea = value => value.replace(/(?:특별자치도|특별자치시|특별시|광역시|도|시|군)$/, '');
  const shortDistrict = value => /^(?:중|동|서|남|북)구$/.test(value) ? value : value.replace(/구$/, '');
  let location;
  if (city.endsWith('구')) {
    location = /^(?:중|동|서|남|북)구$/.test(city) ? `${shortArea(province)} ${city}` : shortDistrict(city);
  } else if (/(?:시|군)$/.test(city)) {
    location = [shortArea(city), district.endsWith('구') ? shortDistrict(district) : ''].filter(Boolean).join(' ');
  } else {
    location = shortArea(province);
  }
  return [location, restaurant.name].filter(Boolean).join(' ');
}
