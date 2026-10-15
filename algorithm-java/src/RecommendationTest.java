import java.util.Arrays;

/** 사용자 TODO 구현 후 점수·정렬·결측·설정 경계를 확인하는 검사입니다. */
public final class RecommendationTest {
    public static void main(String[] args) {
        try {
            RestaurantCandidate a = item("A", 5.0, 1, 0), b = item("B", 4.7, 500, 1), c = item("C", 4.5, 100, 2);
            near(BayesianRanker.score(a, 4, 50), 4.019607843137255);
            near(BayesianRanker.score(b, 4, 50), 4.636363636363637);
            near(BayesianRanker.score(c, 4, 50), 4.333333333333333);
            near(BayesianRanker.score(b, 4, 0), 4.7);
            RestaurantCandidate[] input = { a, b, c, item("D", null, 0, 3), item("E", 4.9, 0, 4),
                new RestaurantCandidate("F", "F", "kakao", null, 0, 5) };
            RestaurantCandidate[] original = input.clone();
            RankedRestaurant[] result = BayesianRanker.rank(input, 4, 50);
            String[] ids = { "B", "C", "A", "D", "E", "F" };
            check(result.length == ids.length, "결과 개수");
            for (int i = 0; i < ids.length; i++) check(ids[i].equals(result[i].restaurant.id), "추천 순서 " + i);
            for (int i = 3; i < result.length; i++) check(result[i].score == null, "평가 없는 장소의 점수는 null");
            check(Arrays.equals(original, input) && a.rating == 5.0, "원본 배열·별점 보존");
            check(BayesianRanker.compare(new RankedRestaurant(a, 4.0000000002), new RankedRestaurant(b, 4.0000000001)) < 0,
                "정렬 전에 점수를 반올림하지 않음");
            check(BayesianRanker.rank(new RestaurantCandidate[0], 4, 50).length == 0, "빈 배열");
            RankedRestaurant[] tied = BayesianRanker.rank(new RestaurantCandidate[] { item("first", 4.7, 500, 0), item("second", 4.7, 500, 1) }, 4, 50);
            check("first".equals(tied[0].restaurant.id), "추천 완전 동점의 최초 순서");
            for (double[] parameters : new double[][] { { Double.NaN, 50 }, { 6, 50 }, { 4, -1 }, { 4, Double.POSITIVE_INFINITY } }) {
                boolean rejected = false;
                try { BayesianRanker.rank(input, parameters[0], parameters[1]); }
                catch (IllegalArgumentException expected) { rejected = true; }
                check(rejected, "잘못된 C/m 거부");
            }
            System.out.println("[통과] 보정 점수·추천 순서·결측·원본 보존·설정 경계 (오차 1e-9 이하)");
        } catch (UnsupportedOperationException error) {
            System.out.println("[미구현] " + error.getMessage());
            System.out.println("BayesianRanker.java의 TODO 두 곳을 작성하면 이 검사가 실행됩니다."); System.exit(2);
        } catch (RuntimeException | AssertionError error) {
            System.err.println("[실패] " + error.getMessage()); System.exit(1);
        }
    }

    private static RestaurantCandidate item(String id, Double rating, long count, int index) {
        return new RestaurantCandidate(id, id, "google", rating, count, index);
    }
    private static void near(double actual, double expected) {
        check(Double.isFinite(actual) && Math.abs(actual - expected) <= 1e-9, "점수 예상=" + expected + ", 실제=" + actual);
    }
    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }
}
