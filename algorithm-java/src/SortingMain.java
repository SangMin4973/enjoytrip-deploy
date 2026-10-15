import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** 데이터 호출 이후 Java에서 입력을 출력하고, 사용자가 채운 정렬 메서드를 실행합니다. */
public final class SortingMain {
    public static void main(String[] args) {
        try {
            CandidateInput input = CandidateInput.read(System.in);
            boolean check = Arrays.asList(args).contains("--check");
            System.out.println("Java 입력 완료: " + input.restaurants.length + "곳 / " + input.mode);
            print("정렬 전 · 수집 순서", input.restaurants);
            RestaurantCandidate[] original = input.restaurants.clone();
            RestaurantCandidate[] result;
            RankedRestaurant[] ranked = null;
            try {
                if (input.mode == SortMode.RECOMMENDED) {
                    double priorMean = numberOption(args, "--prior-mean", BayesianRanker.DEFAULT_PRIOR_MEAN);
                    double priorWeight = numberOption(args, "--prior-weight", BayesianRanker.DEFAULT_PRIOR_WEIGHT);
                    System.out.println("보정 설정: C=" + priorMean + ", m=" + priorWeight);
                    ranked = BayesianRanker.rank(input.restaurants, priorMean, priorWeight);
                    result = new RestaurantCandidate[ranked.length];
                    for (int i = 0; i < ranked.length; i++) result[i] = ranked[i].restaurant;
                } else {
                    result = StableMergeSort.sort(input.restaurants, input.mode);
                }
            } catch (UnsupportedOperationException error) {
                System.out.println("\n[미구현] " + error.getMessage());
                System.out.println("데이터 전달은 완료됐습니다. BayesianRanker.java의 TODO 1~2를 작성하세요.");
                if (check) System.exit(2);
                return;
            }
            if (!Arrays.equals(original, input.restaurants)) throw new IllegalStateException("정렬이 원본 배열을 변경했습니다.");
            verifySameIds(input.restaurants, result);
            print("사용자 구현 결과", result);
            if (ranked != null) {
                System.out.println("\n[서비스 보정 점수 · Google 원본 별점과 별개]");
                for (RankedRestaurant item : ranked) {
                    System.out.println(item.restaurant.id + "\t" + (item.score == null ? "평가 없음" : item.score));
                }
            }
            if (check) {
                if (input.expectedIds.length != result.length) throw new IllegalStateException("예상 결과 개수가 다릅니다.");
                for (int i = 0; i < result.length; i++) {
                    if (!input.expectedIds[i].equals(result[i].id))
                        throw new IllegalStateException("결과 불일치: " + i + "번 예상=" + input.expectedIds[i] + ", 실제=" + result[i].id);
                }
                System.out.println("\n[통과] 샘플 예상 순서와 일치하며 원본 배열을 보존했습니다.");
            }
        } catch (Exception error) {
            System.err.println("[실패] " + error.getMessage());
            System.exit(1);
        }
    }

    private static double numberOption(String[] args, String name, double fallback) {
        for (int i = 0; i < args.length; i++) {
            if (name.equals(args[i])) {
                if (i + 1 >= args.length) throw new IllegalArgumentException(name + " 값이 필요합니다.");
                return Double.parseDouble(args[i + 1]);
            }
        }
        return fallback;
    }

    private static void verifySameIds(RestaurantCandidate[] input, RestaurantCandidate[] result) {
        if (result == null || result.length != input.length) throw new IllegalStateException("음식점 개수가 달라졌습니다.");
        Set<String> ids = new HashSet<String>();
        for (RestaurantCandidate item : input) ids.add(item.id);
        for (RestaurantCandidate item : result) {
            if (item == null || !ids.remove(item.id)) throw new IllegalStateException("결과에 누락·중복·알 수 없는 ID가 있습니다.");
        }
    }

    private static void print(String title, RestaurantCandidate[] restaurants) {
        System.out.println("\n[" + title + "]");
        System.out.println("순서\tID\t가게 이름\t별점\t평가 수\t출처");
        for (RestaurantCandidate item : restaurants) {
            System.out.println(item.originalIndex + "\t" + item.id + "\t" + item.name.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ')
                    + "\t" + (item.rating == null ? "없음" : item.rating) + "\t" + item.userRatingCount + "\t" + item.source);
        }
    }
}
