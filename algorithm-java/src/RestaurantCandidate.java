/** 정렬 입력 데이터. API 호출·입력 변환은 준비되어 있으므로 이 클래스는 그대로 사용합니다. */
public final class RestaurantCandidate {
    public final String id;
    public final String name;
    public final String source;
    public final Double rating;       // null이면 별점 없음
    public final long userRatingCount;
    public final int originalIndex;   // 전체 수집 결과의 최초 순서, 0부터 시작

    public RestaurantCandidate(String id, String name, String source,
            Double rating, long userRatingCount, int originalIndex) {
        this.id = id;
        this.name = name;
        this.source = source;
        this.rating = rating;
        this.userRatingCount = userRatingCount;
        this.originalIndex = originalIndex;
    }
}
