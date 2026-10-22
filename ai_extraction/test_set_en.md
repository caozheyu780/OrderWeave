# Test set v2 (English, mixed language)

Menu: Braised Chicken Rice RM 8.00 (BCR), Fried Kway Teow RM 6.00 (FKT), Milk Tea RM 5.00 (MT).
Delivery locations: Block A, B, C, D.

| # | Message | Expected order |
|---|---|---|
| 1 | Ming: 1 Braised Chicken Rice, deliver to Block B | Braised Chicken Rice x1, Block B, recognized |
| 2 | Hong: BCR extra spicy, make it 2, Block A | Braised Chicken Rice x2, note extra spicy, Block A, recognized |
| 3 | Jie: 2 milk tea less ice | Milk Tea x2, note less ice, location null, needs_confirm (missing location) |
| 4 | Lisa: FKT no spring onion, Block C | Fried Kway Teow x1, note no spring onion, Block C, recognized |
| 5 | Wang: +1 | items empty, needs_confirm (cannot tell what to order) |
| 6 | Ming: 1 BCR and 1 milk tea can? Block B lah | Braised Chicken Rice x1, Milk Tea x1, Block B, recognized |
| 7 | Lee: 1 nasi lemak, Block A | nasi lemak not on menu, needs_confirm |
| 8 | Amy: 3x BCR no spicy, Block D | Braised Chicken Rice x3, note no spicy, Block D, recognized |
| 9 | Chen: milk tea less sugar no ice, block c | Milk Tea x1, note less sugar no ice, Block C, recognized |
| 10 | Hao: 2 BCR, one spicy one not spicy, Block B | Braised Chicken Rice x1 note spicy + Braised Chicken Rice x1 note not spicy, Block B, recognized |
| 11 | Wen: 1 FKT 1 milk tea, deliver to hostel lobby | Fried Kway Teow x1, Milk Tea x1, location unclear, needs_confirm |
| 12 | Kevin: same as before please | items empty, needs_confirm |
| 13 | Mei: 1 BCR add egg, Block A | add egg not on menu, needs_confirm |
| 14 | Wei: 奶茶 3 cups, all full sugar, Block B | Milk Tea x3, note full sugar, Block B, recognized |
| 15 | Lin: FKT large size, Block C | large size not on menu, needs_confirm |
| 16 | Jason: BCR + milk tea combo, Block A | combo not on menu, needs_confirm |
| 17 | Zheng: cancel my order pls | items empty, needs_confirm (cancellation) |
| 18 | Zhou: 2 FKT 1 milk tea Block B, deliver tomorrow noon | Fried Kway Teow x2, Milk Tea x1, note tomorrow noon, Block B, recognized |
| 19 | Xu: 10 BCR | Braised Chicken Rice x10, location null, needs_confirm (missing location) |
| 20 | Ling: FKT 1, tak nak pedas, Block D | Fried Kway Teow x1, note no spicy, Block D, recognized |
