export const CONTENT_TYPES = [
  { code: '12', name: '관광지' },
  { code: '14', name: '문화시설' },
  { code: '15', name: '공연 / 행사' },
  { code: '25', name: '여행코스' },
  { code: '28', name: '레포츠' },
  { code: '32', name: '숙박' },
  { code: '38', name: '쇼핑' },
  { code: '39', name: '음식점' },
];

// 법정동 지역 코드입니다. 기존 예제의 KorService2 / ldongCode2와 맞춥니다.
export const MOCK_AREAS = [
  { code: '11', name: '서울특별시' },
  { code: '26', name: '부산광역시' },
  { code: '50', name: '제주특별자치도' },
];

export const MOCK_DISTRICTS = {
  11: [{ code: '110', name: '종로구' }, { code: '140', name: '중구' }],
  26: [{ code: '110', name: '중구' }, { code: '350', name: '해운대구' }],
  50: [{ code: '110', name: '제주시' }, { code: '130', name: '서귀포시' }],
};

const centers = { 11: [126.978, 37.57], 26: [129.075, 35.18], 50: [126.53, 33.5] };

// 전부 화면 확인용으로 만든 가상 장소입니다. 실제 관광지 정보가 아닙니다.
export const MOCK_PLACES = MOCK_AREAS.flatMap((area) =>
  MOCK_DISTRICTS[area.code].flatMap((district, districtIndex) =>
    CONTENT_TYPES.map((type, index) => ({
      id: `sample-${area.code}-${district.code}-${type.code}`,
      name: `[샘플] ${district.name} ${type.name}`,
      areaCode: area.code,
      districtCode: district.code,
      typeCode: type.code,
      address: `${area.name} ${district.name} (가상 주소)`,
      longitude: centers[area.code][0] + districtIndex * 0.015 + index * 0.002,
      latitude: centers[area.code][1] + districtIndex * 0.01 + index * 0.001,
      phone: '',
      overview: '기능 확인용 가상 장소입니다. 실제 상호, 주소, 운영 정보와 관계가 없습니다.',
      source: '샘플 데이터',
    })),
  ),
);

export function getMockPlaces({ area = '', district = '', type = '', keyword = '', page = 1, size = 10 }) {
  const matched = MOCK_PLACES.filter((place) =>
    (!area || place.areaCode === area)
    && (!district || place.districtCode === district)
    && (!type || place.typeCode === type)
    && (!keyword || `${place.name} ${place.address}`.includes(keyword.trim())),
  );
  return { items: matched.slice((page - 1) * size, page * size), total: matched.length };
}
