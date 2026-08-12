import Foundation

/// Combine per-Fetcher Item groups into the Feed: flatten, collapse duplicates by Item
/// identity (ADR-0001) unioning their Sources, and sort by Signal.
///
/// Pure — no IO, no clock. The deduped representative keeps the earliest-published
/// occurrence's fields (the original publication) and the maximum Signal across all
/// occurrences (a nil Signal never overrides a non-nil one, so a remote Signal survives
/// a merge with an on-device copy that hasn't been scored). Sources are unioned across
/// all occurrences in first-seen order.
///
/// Final order: Signal descending, with nil-Signal items sorted after every
/// Signal-bearing item; ties broken by publishedAt descending, then id ascending.
func mergeFeed(_ groups: [[FeedItem]]) -> [FeedItem] {
    var representativeByID: [String: FeedItem] = [:]
    var sourcesByID: [String: [Source]] = [:]
    // Tracks the (signal, alert) pair of whichever occurrence currently holds the max
    // signal for this id. Absent from the dictionary until an occurrence with a
    // non-nil signal is seen; a nil signal never overrides a non-nil one.
    var signalWinnerByID: [String: (signal: Int, alert: Bool?)] = [:]
    var orderByID: [String: Int] = [:]
    var nextOrder = 0

    for item in groups.flatMap({ $0 }) {
        if orderByID[item.id] == nil {
            orderByID[item.id] = nextOrder
            nextOrder += 1
        }

        // Representative = earliest publishedAt (original publication).
        if let existing = representativeByID[item.id] {
            if item.publishedAt < existing.publishedAt {
                representativeByID[item.id] = item
            }
        } else {
            representativeByID[item.id] = item
        }

        // Signal = max across occurrences (and that occurrence's alert flag);
        // a nil Signal never overrides a non-nil one.
        if let candidateSignal = item.signal {
            if let winner = signalWinnerByID[item.id] {
                if candidateSignal > winner.signal {
                    signalWinnerByID[item.id] = (candidateSignal, item.alert)
                }
            } else {
                signalWinnerByID[item.id] = (candidateSignal, item.alert)
            }
        }

        // Union Sources in first-seen order, de-duplicating by name.
        var seen = sourcesByID[item.id] ?? []
        for source in item.sources where !seen.contains(source) {
            seen.append(source)
        }
        sourcesByID[item.id] = seen
    }

    let deduped: [FeedItem] = representativeByID.values.map { rep in
        let winner = signalWinnerByID[rep.id]
        return FeedItem(
            title: rep.title,
            snippet: rep.snippet,
            url: rep.url,
            sources: sourcesByID[rep.id] ?? rep.sources,
            category: rep.category,
            publishedAt: rep.publishedAt,
            imageURL: rep.imageURL,
            signal: winner?.signal,
            alert: winner?.alert
        )
    }

    return deduped.sorted { lhs, rhs in
        if lhs.signal != rhs.signal {
            switch (lhs.signal, rhs.signal) {
            case (.some(let l), .some(let r)):
                return l > r
            case (.some, nil):
                return true
            case (nil, .some):
                return false
            case (nil, nil):
                break
            }
        }
        if lhs.publishedAt != rhs.publishedAt {
            return lhs.publishedAt > rhs.publishedAt
        }
        return lhs.id < rhs.id
    }
}
