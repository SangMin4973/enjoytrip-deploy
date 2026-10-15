import java.util.Base64;
import java.nio.charset.StandardCharsets;

/** 웹 서버용 입출력 어댑터. 정렬과 점수 계산은 기존 Java 구현을 그대로 호출합니다. */
public final class WebRankingMain {
    private WebRankingMain() { }

    public static void main(String[] args) {
        try {
            CandidateInput input = CandidateInput.read(System.in);
            StringBuilder output = new StringBuilder("MATZIP_RANK_V1\t" + input.restaurants.length + "\n");
            if (input.mode == SortMode.RECOMMENDED) {
                RankedRestaurant[] ranked = BayesianRanker.rank(input.restaurants,
                        BayesianRanker.DEFAULT_PRIOR_MEAN, BayesianRanker.DEFAULT_PRIOR_WEIGHT);
                for (RankedRestaurant item : ranked) append(output, item.restaurant.id, item.score);
            } else {
                for (RestaurantCandidate item : StableMergeSort.sort(input.restaurants, input.mode)) {
                    append(output, item.id, null);
                }
            }
            System.out.print(output);
        } catch (Exception error) {
            // 상세 오류나 입력 데이터는 공개 응답에 전달하지 않습니다.
            System.err.println("Invalid ranking input or execution failure");
            System.exit(1);
        }
    }

    private static void append(StringBuilder output, String id, Double score) {
        output.append(Base64.getEncoder().encodeToString(id.getBytes(StandardCharsets.UTF_8)))
                .append('\t').append(score == null ? "null" : Double.toString(score)).append('\n');
    }
}
