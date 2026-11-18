using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Studio.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class AreaHierarchy : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "parent_id",
                table: "areas",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "ix_areas_parent_id",
                table: "areas",
                column: "parent_id");

            migrationBuilder.AddCheckConstraint(
                name: "ck_areas_no_self_parent",
                table: "areas",
                sql: "parent_id IS NULL OR parent_id <> id");

            migrationBuilder.AddForeignKey(
                name: "fk_areas_areas_parent_id",
                table: "areas",
                column: "parent_id",
                principalTable: "areas",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "fk_areas_areas_parent_id",
                table: "areas");

            migrationBuilder.DropIndex(
                name: "ix_areas_parent_id",
                table: "areas");

            migrationBuilder.DropCheckConstraint(
                name: "ck_areas_no_self_parent",
                table: "areas");

            migrationBuilder.DropColumn(
                name: "parent_id",
                table: "areas");
        }
    }
}
