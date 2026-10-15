/** 일시적인 추천 결과입니다. 원본 장소 객체에 점수를 덮어쓰지 않습니다. */
public final class RankedRestaurant {
    public final RestaurantCandidate restaurant;
    public final Double score; // 평가 정보가 없는 장소는 null

    public RankedRestaurant(RestaurantCandidate restaurant, Double score) {
        this.restaurant = restaurant;
        this.score = score;
    }
}
