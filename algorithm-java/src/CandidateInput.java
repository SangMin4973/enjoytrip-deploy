import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashSet;
import java.util.Set;

/** Node가 전달한 데이터를 읽는 입출력 코드입니다. 정렬 구현을 위해 수정할 필요가 없습니다. */
public final class CandidateInput {
    public final SortMode mode;
    public final RestaurantCandidate[] restaurants;
    public final String[] expectedIds;

    private CandidateInput(SortMode mode, RestaurantCandidate[] restaurants, String[] expectedIds) {
        this.mode = mode;
        this.restaurants = restaurants;
        this.expectedIds = expectedIds;
    }

    public static CandidateInput read(InputStream input) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(input, StandardCharsets.UTF_8));
        String line = reader.readLine();
        if (line == null) throw new IllegalArgumentException("입력 데이터가 없습니다. npm 실행 명령을 사용하세요.");
        String[] header = line.split("\t", -1);
        if (header.length != 3 || !"MATZIP_SORT_V1".equals(header[0]))
            throw new IllegalArgumentException("정렬 입력 형식이 올바르지 않습니다.");
        SortMode mode = SortMode.valueOf(header[1]);
        int count = Integer.parseInt(header[2]);
        if (count < 0 || count > 1000) throw new IllegalArgumentException("입력 개수는 0~1000개여야 합니다.");
        RestaurantCandidate[] restaurants = new RestaurantCandidate[count];
        Set<String> ids = new HashSet<String>();
        for (int i = 0; i < count; i++) {
            line = reader.readLine();
            if (line == null) throw new IllegalArgumentException("입력 데이터가 부족합니다.");
            String[] fields = line.split("\t", -1);
            if (fields.length != 6) throw new IllegalArgumentException("음식점 입력 필드는 6개여야 합니다.");
            String id = decode(fields[0]), name = decode(fields[1]), source = fields[2];
            Double rating = "null".equals(fields[3]) ? null : Double.valueOf(fields[3]);
            long ratingCount = Long.parseLong(fields[4]);
            int index = Integer.parseInt(fields[5]);
            if (id.isEmpty() || !ids.add(id) || !("google".equals(source) || "kakao".equals(source))
                    || ratingCount < 0 || ratingCount > 9007199254740991L || index != i
                    || (rating != null && (!Double.isFinite(rating) || rating < 1 || rating > 5)))
                throw new IllegalArgumentException("음식점 입력 값이 올바르지 않습니다.");
            restaurants[i] = new RestaurantCandidate(id, name, source, rating, ratingCount, index);
        }
        line = reader.readLine();
        if (line == null || !("EXPECTED".equals(line) || line.startsWith("EXPECTED\t")))
            throw new IllegalArgumentException("예상 결과 입력이 없습니다.");
        String[] expectedFields = line.split("\t", -1);
        String[] expectedIds = new String[expectedFields.length - 1];
        for (int i = 0; i < expectedIds.length; i++) expectedIds[i] = decode(expectedFields[i + 1]);
        if (reader.readLine() != null) throw new IllegalArgumentException("입력 뒤에 불필요한 데이터가 있습니다.");
        return new CandidateInput(mode, restaurants, expectedIds);
    }

    private static String decode(String value) {
        return new String(Base64.getDecoder().decode(value), StandardCharsets.UTF_8);
    }
}
