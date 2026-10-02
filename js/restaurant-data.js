// 화면 확인용 음식점입니다. 이름·전화번호·주소·평점은 실제 매장 정보가 아닙니다.
// 카카오 지도는 실제 SDK를 사용하지만 아래 좌표는 예시 음식점의 표시 위치입니다.
const regions = [
  { name: '광주', district: '동구', street: '금남로', lat: 35.1478, lng: 126.9196, phone: '062', aliases: ['광주광역시', '전라도'] },
  { name: '부산', district: '해운대구', street: '해운대해변로', lat: 35.1631, lng: 129.1635, phone: '051', aliases: ['부산광역시', '해운대'] },
  { name: '서울', district: '종로구', street: '삼일대로', lat: 37.5712, lng: 126.9887, phone: '02', aliases: ['서울특별시', '종로', '익선동'] },
  { name: '제주', district: '제주시', street: '중앙로', lat: 33.5004, lng: 126.5285, phone: '064', aliases: ['제주도', '제주특별자치도'] },
];
const menus = [
  { name: '치킨', suffix: '바삭치킨', keywords: ['치킨', '닭', '후라이드', '양념', '통닭'], cell: 0 },
  { name: '불고기', suffix: '불고기식당', keywords: ['고기', '불고기', '한식', '소고기', '고깃집'], cell: 1 },
  { name: '피자', suffix: '치즈피자', keywords: ['피자', '양식', '치즈', '이탈리안'], cell: 4 },
  { name: '김밥', suffix: '김밥한줄', keywords: ['김밥', '한식', '분식', '비빔밥', '밥'], cell: 9 },
  { name: '국밥', suffix: '따뜻한국밥', keywords: ['국밥', '국', '한식', '돼지', '밥'], cell: 10 },
  { name: '삼겹살', suffix: '삼겹살집', keywords: ['삼겹살', '고기', '돼지', '한식', '고깃집'], cell: 8 },
];
const prefixes = ['도트골목', '노랑부엌', '빨강테이블', '한입여행', '픽셀식탁', '따뜻한골목'];

// 공개 레시피 영상 4개를 예시로 사용합니다. 예시 음식점 방문 영상으로 표현하지 않습니다.
export const EXAMPLE_VIDEOS = [
  { id: 'XnLWBoZn710', title: '양념치킨 만들기', creator: 'Maangchi' },
  { id: '6QQ67F8y2b8', title: '비빔밥과 돌솥비빔밥 만들기', creator: 'Maangchi' },
  { id: 'Y-Y9CXGRJPU', title: '김밥 만들기', creator: 'Maangchi' },
  { id: '0smDhdzqXu8', title: '바삭한 한국식 양념치킨', creator: 'Maangchi' },
];

export function createExampleRestaurants() {
  return regions.flatMap((region, regionIndex) => menus.map((menu, index) => ({
    id: `example-${regionIndex}-${index}`,
    name: `${prefixes[(index + regionIndex) % prefixes.length]} ${menu.suffix}`,
    region: region.name,
    regionAliases: region.aliases,
    district: region.district,
    address: `${region.name} ${region.district} ${region.street} ${24 + index * 7} (예시)`,
    phone: `${region.phone}-000-${String(1001 + index + regionIndex * 10)}`,
    menu: menu.name,
    menuKeywords: menu.keywords,
    rating: [4.7, 4.5, 4.8, 4.4, 4.6, 4.3][(index + regionIndex) % 6],
    reviewCount: 38 + index * 27 + regionIndex * 19,
    latitude: region.lat + (index % 3 - 1) * .004,
    longitude: region.lng + (Math.floor(index / 3) - .5) * .008,
    imageCell: menu.cell,
    image: '',
    description: `${menu.name} 한 끼로 시작하는 ${region.name} 맛집 여행. 화면 구성을 확인하기 위해 준비한 예시 음식점입니다.`,
    googleResults: [
      { title: `${prefixes[(index + regionIndex) % prefixes.length]}의 메뉴 이야기`, text: `${menu.name} 메뉴와 한 끼를 살펴보는 검색 결과 예시입니다. 실제 검색 결과나 리뷰를 수집한 내용은 아닙니다.` },
      { title: `${region.name} ${menu.name} 여행 기록`, text: `음식점 정보를 여러 출처에서 비교하는 화면의 예시입니다. 방문 전 메뉴와 위치를 직접 확인해 보세요.` },
      { title: '방문 전 확인할 것', text: '전화번호, 영업시간, 메뉴와 위치를 실제 음식점 검색 결과에서 확인해 보세요.' },
    ],
    videos: EXAMPLE_VIDEOS,
    isExample: true,
  })));
}

const normalize = value => String(value || '').toLocaleLowerCase('ko-KR').replace(/\s+/g, '');

// 지역은 필수이고 메뉴는 선택입니다. 메뉴 동의어도 예시 데이터의 키워드로 비교합니다.
export function filterRestaurants(restaurants, region, menu = '') {
  const place = normalize(region);
  const words = String(menu).trim().split(/[\s,/]+/).filter(Boolean).map(normalize);
  return restaurants.filter(restaurant => {
    const regionText = normalize([restaurant.region, restaurant.district, restaurant.address, ...restaurant.regionAliases].join(''));
    const menuText = normalize([restaurant.name, restaurant.menu, ...restaurant.menuKeywords].join(''));
    return regionText.includes(place) && words.every(word => menuText.includes(word));
  });
}
