import java.util.Arrays;
import java.util.Comparator;

/** API 없이 실행하는 기존 병합 정렬의 경계 조건 검사입니다. */
public final class AlgorithmTest {
    private static int checks;

    public static void main(String[] args) {
        try {
            for (SortMode mode : new SortMode[] { SortMode.RATING_DESC, SortMode.COUNT_DESC }) {
                expect(new RestaurantCandidate[0], mode);
                expect(new RestaurantCandidate[] { item("one", 4.0, 10, 0) }, mode, "one");
                expect(new RestaurantCandidate[] { item("low", 3.0, 1, 0), item("high", 5.0, 100, 1) }, mode, "high", "low");
                expect(new RestaurantCandidate[] { item("first", 4.5, 100, 0), item("second", 4.5, 100, 1) }, mode, "first", "second");
                expect(new RestaurantCandidate[] { item("none", null, 0, 0), item("zero", 4.5, 0, 1),
                    new RestaurantCandidate("kakao", "kakao", "kakao", 5.0, 1000, 2) }, mode, "none", "zero", "kakao");
            }
            RestaurantCandidate[] priorities = { item("many", 4.8, 300, 0), item("highest", 4.9, 2, 1), item("few", 4.8, 30, 2) };
            expect(priorities, SortMode.RATING_DESC, "highest", "many", "few");
            expect(priorities, SortMode.COUNT_DESC, "many", "few", "highest");
            expect(new RestaurantCandidate[] { item("nan", Double.NaN, 10, 0), item("infinity", Double.POSITIVE_INFINITY, 10, 1),
                item("over", 6.0, 10, 2), item("under", 0.0, 10, 3), item("negative", 5.0, -1, 4), item("valid", 4.0, 1, 5) },
                SortMode.RATING_DESC, "valid", "nan", "infinity", "over", "under", "negative");
            expect(new RestaurantCandidate[] { item("small", 4.8, 1, 0), item("large", 4.8, 9007199254740991L, 1) },
                SortMode.COUNT_DESC, "large", "small");

            // 비교 결과가 0인 원소의 실제 병합 안정성도 확인합니다.
            String[] tags = { "b0", "a0", "b1", "a1", "b2" };
            String[] result = StableMergeSort.sort(tags, new Comparator<String>() {
                @Override public int compare(String a, String b) { return Character.compare(a.charAt(0), b.charAt(0)); }
            });
            check(Arrays.equals(result, new String[] { "a0", "a1", "b0", "b1", "b2" }), "일반 비교자의 동점 안정성");
            check(Arrays.equals(tags, new String[] { "b0", "a0", "b1", "a1", "b2" }), "일반 정렬 원본 보존");

            RestaurantCandidate[] fortyFive = new RestaurantCandidate[45];
            for (int i = 0; i < fortyFive.length; i++) fortyFive[i] = item("place" + i, 1.0 + i % 5, i + 1, i);
            RestaurantCandidate[] sorted = StableMergeSort.sort(fortyFive, SortMode.RATING_DESC);
            check("place44".equals(sorted[0].id), "45곳 전체에서 가장 높은 우선순위 선택");
            check(sorted.length == 45 && "place0".equals(fortyFive[0].id), "전체 개수와 원본 보존");
            boolean rejected = false;
            try { StableMergeSort.sort(fortyFive, SortMode.RECOMMENDED); }
            catch (IllegalArgumentException expected) { rejected = true; }
            check(rejected, "추천 모드를 평가 수순으로 잘못 실행하지 않음");
            check(BayesianRanker.rank(new RestaurantCandidate[0], 4, 50).length == 0, "추천 준비 경로의 빈 입력");
            RankedRestaurant[] missing = BayesianRanker.rank(new RestaurantCandidate[] { item("no-rating", null, 0, 0) }, 4, 50);
            check(missing.length == 1 && missing[0].score == null, "평가 없는 한 곳은 점수 계산 없이 보존");
            System.out.println("[통과] Java 병합 정렬 검사 " + checks + "개 (API 호출 없음)");
        } catch (RuntimeException | AssertionError error) {
            System.err.println("[실패] " + error.getMessage()); System.exit(1);
        }
    }

    private static RestaurantCandidate item(String id, Double rating, long count, int index) {
        return new RestaurantCandidate(id, id, "google", rating, count, index);
    }

    private static void expect(RestaurantCandidate[] input, SortMode mode, String... expectedIds) {
        RestaurantCandidate[] original = input.clone(), result = StableMergeSort.sort(input, mode);
        check(result.length == expectedIds.length, mode + " 결과 개수");
        for (int i = 0; i < result.length; i++) check(expectedIds[i].equals(result[i].id), mode + " " + i + "번 결과");
        check(Arrays.equals(original, input), mode + " 원본 배열 보존");
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label); checks++;
    }
}
