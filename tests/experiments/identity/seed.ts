import { openFixture, seedOwner } from './fixture.ts';
const connection = openFixture(process.argv[2]);
try {
  console.log(await seedOwner(connection.db, process.argv[3], process.argv[4]));
} finally {
  connection.close();
}
